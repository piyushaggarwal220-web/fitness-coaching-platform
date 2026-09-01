import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { LIMITS, MODELS, PLAN_GENERATION_TEMPERATURE } from '@/lib/ai/config'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import {
  CALORIE_FORMULA_PROMPT_RULES,
  DAY_HEADER_PROMPT_RULES,
  DIET_COACH_WRITING_RULES,
  DIET_LIFESTYLE_RESPECT_RULES,
  DIET_MODIFY_COACH_WRITING_RULES,
  DIET_PREFERENCE_ENFORCEMENT_RULES,
  EDIT_CALORIE_PRESERVATION_RULES,
  EDIT_EXPENDITURE_FIRST_RULES,
  EXERCISE_NAME_PROMPT_RULES,
  HIGH_FLUX_OUTPUT_PAIRING_RULES,
  HIGH_FLUX_PHILOSOPHY_RULES,
  PROTEIN_CALORIE_PROMPT_RULES,
  WORKOUT_SECTION_PROMPT_RULES,
  WORKOUT_VOLUME_PROMPT_RULES,
} from '@/lib/ai/plan-quality-rules'
import { buildDietHardConstraintsSection } from '@/lib/ai/prompt-builder'
import { normalizeAiPlanProse } from '@/lib/ai/plan-format'
import { formatCalorieGuidanceBlock, clientRequestNeedsExpenditureFocus, requestTouchesCalories, requestTargetsMaintenance, autoDietCoachInstruction, autoDietModifyInstruction } from '@/lib/ai/calorie-targets'
import { resolveDietFloorKcal } from '@/lib/ai/plan-quality-rules'
import {
  parseHeaderCalories,
  syncStoredDietText,
} from '@/lib/ai/nutrition-macro-sync'
import { REMAKE_PLAN_PREFIX } from '@/lib/coach/remake-plan'
import { SAFE_RATE_OF_CHANGE_RULE } from '@/lib/ai/safe-change-policy'
import {
  CLIENT_PLAN_EDIT_WEEK_RULES,
  DIET_MODIFY_PLAN_RULES,
  FRESH_PLAN_OUTPUT_RULES,
  stripClientWeekHandoffLanguage,
  stripPlanEditMetaLanguage,
} from '@/lib/ai/plan-prose-guards'
import { logAiGeneration } from '@/lib/ai/trace-log'
import type { OnboardingProfile } from '@/types/database'

export type PlanSectionKind = 'nutrition' | 'workout'

export type PlanEditSource = 'coach' | 'client'

export type EditPlanSectionInput = {
  section: PlanSectionKind
  currentText: string
  /** Coach-facing instruction (plan editor AI). */
  coachInstruction?: string | null
  /** Client change-request text (automated client edit flow). */
  clientRequest?: string | null
  coachNote?: string | null
  editSource?: PlanEditSource
  /** When true, ignore current text and rewrite the section from profile. */
  remakeFromScratch?: boolean
  clientName?: string | null
  clientId?: string
  previousCalories?: number | null
  profile?: Pick<
    OnboardingProfile,
    | 'weight'
    | 'height'
    | 'age'
    | 'gender'
    | 'activity_level'
    | 'fitness_goal'
    | 'onboarding_data'
    | 'sleep_duration'
    | 'training_experience'
    | 'injuries'
    | 'diet_preference'
    | 'medical_notes'
  > | null
}

export type EditPlanSectionResult = {
  revisedText: string
  model: string
  inputTokens: number
  outputTokens: number
  summary: string
}

function sectionLabel(section: PlanSectionKind): string {
  return section === 'nutrition' ? 'nutrition / diet plan' : 'workout plan'
}

function resolveEditInstruction(input: EditPlanSectionInput): {
  instruction: string
  source: PlanEditSource
} {
  const coach = input.coachInstruction?.trim()
  const client = input.clientRequest?.trim()
  const hasCurrentDiet = input.section === 'nutrition' && input.currentText.trim().length > 0
  if (coach) {
    return { instruction: coach, source: input.editSource ?? 'coach' }
  }
  if (client) {
    return { instruction: client, source: input.editSource ?? 'client' }
  }
  if (input.section === 'nutrition' && input.profile) {
    if (input.remakeFromScratch || !hasCurrentDiet) {
      return { instruction: autoDietCoachInstruction(input.profile), source: 'coach' }
    }
    return { instruction: autoDietModifyInstruction(input.profile), source: 'coach' }
  }
  if (input.remakeFromScratch) {
    return {
      instruction:
        input.section === 'workout'
          ? 'Remake the workout plan completely from the client profile. Ignore the current draft text. Full week with Day 1 (Monday) through Day 7. No edit meta.'
          : 'Remake the diet plan completely from the client profile. Ignore the current draft text. Full 7-day plan with matching header and daily totals. No edit meta.',
      source: 'coach',
    }
  }
  throw new Error('Coach instruction or client request is required.')
}

function buildMockRevision(input: EditPlanSectionInput): string {
  const { instruction } = resolveEditInstruction(input)
  const note = input.coachNote?.trim()
  const header = [
    `Rewrote ${sectionLabel(input.section)} (mock)`,
    `Instruction: ${instruction}`,
    note ? `Note: ${note}` : null,
    '',
  ]
    .filter(Boolean)
    .join('\n')

  const body = input.currentText.trim() || `(No prior ${sectionLabel(input.section)} — add structure here.)`
  return `${header}\n${body}\n\n[Apply instruction as a fresh rewrite — no edit meta in client-facing text.]`
}

function extractRevisedText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const fenced = trimmed.match(/```(?:markdown|text|md)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) return fenced[1].trim()

  // Prefer JSON { "revisedText": "..." } if the model wraps it
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { revisedText?: unknown; revised_text?: unknown }
      const value = parsed.revisedText ?? parsed.revised_text
      if (typeof value === 'string' && value.trim()) return value.trim()
    } catch {
      /* fall through */
    }
  }

  return trimmed
}

function planTextSimilarityLocal(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
  const wa = tokenize(a)
  const wb = tokenize(b)
  if (wa.size === 0 && wb.size === 0) return 1
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter += 1
  return inter / Math.max(wa.size, wb.size)
}

export async function editPlanSection(input: EditPlanSectionInput): Promise<EditPlanSectionResult> {
  const currentText = input.currentText.trim()
  const { instruction, source } = resolveEditInstruction(input)

  const section = sectionLabel(input.section)
  const combinedCalorieRequest = [instruction, input.coachNote].filter(Boolean).join('\n')
  const needsExpenditure = clientRequestNeedsExpenditureFocus(combinedCalorieRequest)
  const touchesCalories =
    input.section === 'nutrition' && requestTouchesCalories(instruction, input.coachNote) && !needsExpenditure
  const targetsMaintenance = requestTargetsMaintenance(instruction, input.coachNote)
  const isDietModify =
    input.section === 'nutrition' && !input.remakeFromScratch && currentText.length > 0
  const preserveCalories = !touchesCalories || needsExpenditure
  const mandatoryCalorieTarget =
    input.section === 'nutrition' && input.profile && (!isDietModify || touchesCalories || needsExpenditure)
      ? formatCalorieGuidanceBlock(input.profile)
      : null
  const calorieRules = needsExpenditure
    ? EDIT_EXPENDITURE_FIRST_RULES
    : touchesCalories
      ? SAFE_RATE_OF_CHANGE_RULE
      : EDIT_CALORIE_PRESERVATION_RULES
  const systemPrompt = [
    source === 'coach'
      ? 'You are an expert fitness coach rewriting a client plan section from the coach\'s direction.'
      : 'You are an expert fitness coach rewriting a client plan section based on the client\'s request.',
    `Produce a fresh, complete ${section} — not an in-place patch of the old text.`,
    'Rules:',
    input.remakeFromScratch
      ? REMAKE_PLAN_PREFIX
      : isDietModify
        ? DIET_MODIFY_PLAN_RULES
        : FRESH_PLAN_OUTPUT_RULES,
    input.remakeFromScratch
      ? '- Discard the current draft entirely. Use client profile/context only.'
      : isDietModify
        ? '- The CURRENT PLAN below is the base template. Change only what the instruction or Hard Constraints require; keep everything else the same.'
        : '- Use the current plan below only as background (foods they eat, exercises they use, schedule). Rewrite the full section applying the instruction.',
    '- Preserve useful structure: day headers as Day N (Weekday) with Day 1 = Monday, meal names, exercise lines with sets x reps (plain letter x).',
    DAY_HEADER_PROMPT_RULES,
    input.section === 'nutrition' ? CALORIE_FORMULA_PROMPT_RULES : null,
    input.section === 'nutrition' ? DIET_PREFERENCE_ENFORCEMENT_RULES : null,
    input.section === 'nutrition' ? DIET_LIFESTYLE_RESPECT_RULES : null,
    input.section === 'nutrition'
      ? isDietModify
        ? DIET_MODIFY_COACH_WRITING_RULES
        : DIET_COACH_WRITING_RULES
      : null,
    calorieRules,
    mandatoryCalorieTarget,
    targetsMaintenance
      ? 'MAINTENANCE FOCUS: Rebuild portions to maintenance-level food — generous enough to train and recover. Header, daily totals, and meal lines must all match.'
      : null,
    HIGH_FLUX_PHILOSOPHY_RULES,
    HIGH_FLUX_OUTPUT_PAIRING_RULES,
    '- If the instruction names specific foods, exercises, days, or constraints, the rewritten plan must reflect them.',
    '- Keep language natural, human, and coach-ready in plain text, not JSON.',
    '- Do not use Markdown, asterisks, star bullets, or hyphen bullets.',
    '- Use plain section titles and put list items on separate lines without symbol prefixes.',
    '- For workout sections: one exercise per line under each day header as "Exercise: N sets x M reps" (or timed duration). The name before the colon must be a real lift or movement, not a coaching sentence or a muscle-group-only label. The daily tracker parses these lines.',
    EXERCISE_NAME_PROMPT_RULES,
    WORKOUT_SECTION_PROMPT_RULES,
    WORKOUT_VOLUME_PROMPT_RULES,
    '- For nutrition sections: if protein is hard to hit with allowed foods, lower protein and keep calories high. Never inflate protein numbers. Daily totals count only the primary meal option. Minimum platform kcal floor unless the coach already set otherwise.',
    PROTEIN_CALORIE_PROMPT_RULES,
    '- Do not invent unsafe extreme restrictions or medical claims.',
    '- Never introduce cross-day references ("same as Day 1", "repeat Day 2", "follow Day 3\'s plan", "as above"). Every day must keep its full meal or exercise list written out so the daily tracker can parse it.',
    '- Never put the next day\'s exercises under Post-Workout / Recovery / Stretching of the previous day.',
    '- If the instruction asks one day to mirror another, copy the full content under both day headers instead of pointing between days.',
    `- ${CLIENT_PLAN_EDIT_WEEK_RULES}`,
  ]
    .filter((line): line is string => line != null)
    .join('\n')

  const userPrompt = [
    input.clientName ? `Client: ${input.clientName}` : null,
    `Section: ${section}`,
    source === 'coach' ? 'Task: coach-directed fresh rewrite.' : 'Task: client-requested fresh rewrite.',
    input.remakeFromScratch ? 'Mode: REMAKE FROM SCRATCH — ignore current draft body.' : null,
    input.section === 'nutrition' && input.profile
      ? buildDietHardConstraintsSection(input.profile as OnboardingProfile)
      : null,
    '',
    source === 'coach' ? '## Coach instruction' : '## Client request',
    instruction,
    input.coachNote?.trim() ? `\n## Additional context\n${input.coachNote.trim()}` : null,
    '',
    input.remakeFromScratch
      ? '## Current plan (ignore — profile-driven remake only)'
      : '## Current plan (background context only — rewrite from scratch, do not patch in place)',
    currentText || '(empty — write a complete starter section that matches the instruction)',
  ]
    .filter((line) => line != null)
    .join('\n')

  const providerMode = getPlanProviderMode()
  const started = Date.now()
  // Full-week section rewrites need the same model/token headroom as generation —
  // Haiku + 2k ceilings truncated mid-week ("half plans").
  const model = MODELS.CLAUDE_SONNET
  const maxAttempts = providerMode === 'mock' ? 1 : 2
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let lastRaw = ''

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const retryHint =
        attempt > 0
          ? '\n\n## Retry instruction\nPrevious output was too similar to the background plan, contained edit meta, or truncated. Rewrite the COMPLETE section from scratch. No mention of edits/changes. No cross-day references. Start with plan content only.'
          : ''

      let response
      try {
        response = await callPlanProvider(providerMode, {
          systemPrompt,
          userPrompt: `${userPrompt}${retryHint}`,
          model,
          maxTokens: LIMITS.MAX_SECTION_EDIT_TOKENS,
          temperature: PLAN_GENERATION_TEMPERATURE,
          mockText: buildMockRevision(input),
        })
      } catch (err) {
        if (
          err instanceof ClaudeResponseError &&
          err.retryable &&
          attempt < maxAttempts - 1
        ) {
          continue
        }
        throw err
      }

      totalInputTokens += response.inputTokens
      totalOutputTokens += response.outputTokens
      lastRaw = response.text

      if (response.stopReason === 'max_tokens') {
        if (attempt < maxAttempts - 1) continue
        throw new ClaudeResponseError(
          'AI revision was truncated (hit max output tokens). Try again or shorten coach notes.'
        )
      }

      const revisedRaw = stripPlanEditMetaLanguage(
        stripClientWeekHandoffLanguage(normalizeAiPlanProse(extractRevisedText(response.text)))
      )
      if (!revisedRaw) {
        if (attempt < maxAttempts - 1) continue
        throw new ClaudeResponseError('AI returned an empty revision.')
      }

      const revisedText =
        input.section === 'nutrition'
          ? syncStoredDietText(revisedRaw, {
              previousCalories:
                input.previousCalories ?? parseHeaderCalories(currentText),
              preserveCalories,
              floorKcal: input.profile ? resolveDietFloorKcal(input.profile.weight) : undefined,
            })
          : revisedRaw

      // Reject near-copies when the coach asked for a targeted rewrite (not diet modify / scratch remake).
      if (
        currentText &&
        attempt < maxAttempts - 1 &&
        source === 'coach' &&
        instruction.trim() &&
        !input.remakeFromScratch &&
        !isDietModify
      ) {
        const similarity = planTextSimilarityLocal(currentText, revisedText)
        if (similarity >= 0.93) {
          continue
        }
      }

      const summary =
        source === 'coach'
          ? `Rewrote ${section} from coach instruction (${revisedText.length} chars).`
          : `Rewrote ${section} from client request (${revisedText.length} chars).`

      await logAiGeneration({
        clientId: input.clientId ?? null,
        coachId: null,
        action: `edit_plan_${input.section}`,
        model: response.model,
        latencyMs: Date.now() - started,
        promptTokens: totalInputTokens,
        completionTokens: totalOutputTokens,
        retryCount: attempt,
        validationResult: 'ok',
        success: true,
        knowledgeRefs: null,
        renderedOutput: { summary },
      }).catch(() => undefined)

      return {
        revisedText,
        model: response.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        summary,
      }
    }

    throw new ClaudeResponseError(
      `AI revision failed after retry. Raw response: ${lastRaw.slice(0, 400)}`
    )
  } catch (err) {
    await logAiGeneration({
      clientId: input.clientId ?? null,
      coachId: null,
      action: `edit_plan_${input.section}`,
      model,
      latencyMs: Date.now() - started,
      promptTokens: totalInputTokens || null,
      completionTokens: totalOutputTokens || null,
      retryCount: 0,
      validationResult: 'error',
      success: false,
      knowledgeRefs: null,
      rawOutput: { error: err instanceof Error ? err.message : 'edit failed' },
    }).catch(() => undefined)
    throw err
  }
}

export type EditPlanForClientChangeInput = {
  scope: 'diet' | 'workout' | 'both'
  nutritionText: string
  workoutText: string
  clientRequest: string
  coachNote?: string | null
  clientName?: string | null
  clientId?: string
  profile?: EditPlanSectionInput['profile']
}

export type EditPlanForClientChangeResult = {
  nutritionPlan: string
  workoutPlan: string
  model: string
  inputTokens: number
  outputTokens: number
  summary: string
}

function extractBothSections(raw: string): { nutritionPlan: string; workoutPlan: string } | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as {
      nutritionPlan?: unknown
      nutrition_plan?: unknown
      workoutPlan?: unknown
      workout_plan?: unknown
    }
    const nutritionPlan = parsed.nutritionPlan ?? parsed.nutrition_plan
    const workoutPlan = parsed.workoutPlan ?? parsed.workout_plan
    if (typeof nutritionPlan !== 'string' || typeof workoutPlan !== 'string') return null
    if (!nutritionPlan.trim() || !workoutPlan.trim()) return null
    return { nutritionPlan: nutritionPlan.trim(), workoutPlan: workoutPlan.trim() }
  } catch {
    return null
  }
}

/** One AI call for diet + workout client change requests (avoids duplicate section runs). */
export async function editPlanForClientChange(
  input: EditPlanForClientChangeInput
): Promise<EditPlanForClientChangeResult> {
  if (input.scope === 'diet') {
    const diet = await editPlanSection({
      section: 'nutrition',
      currentText: input.nutritionText,
      clientRequest: input.clientRequest,
      coachNote: input.coachNote,
      editSource: 'client',
      clientName: input.clientName,
      clientId: input.clientId,
      previousCalories: parseHeaderCalories(input.nutritionText),
      profile: input.profile,
    })
    return {
      nutritionPlan: diet.revisedText,
      workoutPlan: input.workoutText,
      model: diet.model,
      inputTokens: diet.inputTokens,
      outputTokens: diet.outputTokens,
      summary: diet.summary,
    }
  }

  if (input.scope === 'workout') {
    const workout = await editPlanSection({
      section: 'workout',
      currentText: input.workoutText,
      clientRequest: input.clientRequest,
      coachNote: input.coachNote,
      editSource: 'client',
      clientName: input.clientName,
      clientId: input.clientId,
    })
    return {
      nutritionPlan: input.nutritionText,
      workoutPlan: workout.revisedText,
      model: workout.model,
      inputTokens: workout.inputTokens,
      outputTokens: workout.outputTokens,
      summary: workout.summary,
    }
  }

  const clientRequest = input.clientRequest.trim()
  if (!clientRequest) throw new Error('Client request is required.')

  const combinedCalorieRequest = [clientRequest, input.coachNote].filter(Boolean).join('\n')
  const needsExpenditure = clientRequestNeedsExpenditureFocus(combinedCalorieRequest)
  const touchesCalories = requestTouchesCalories(clientRequest, input.coachNote) && !needsExpenditure
  const targetsMaintenance = requestTargetsMaintenance(clientRequest, input.coachNote)
  const preserveCalories = !touchesCalories || needsExpenditure
  const mandatoryCalorieTarget = input.profile ? formatCalorieGuidanceBlock(input.profile) : null
  const calorieRules = needsExpenditure
    ? EDIT_EXPENDITURE_FIRST_RULES
    : touchesCalories
      ? SAFE_RATE_OF_CHANGE_RULE
      : EDIT_CALORIE_PRESERVATION_RULES
  const systemPrompt = [
    'You are an expert fitness coach rewriting a client\'s diet and workout from their request.',
    'Output ONLY valid JSON with keys "nutritionPlan" and "workoutPlan" (plain text values, no markdown fences).',
    'Rules:',
    FRESH_PLAN_OUTPUT_RULES,
    '- Rewrite BOTH sections from scratch using the current plans as background only.',
    '- Preserve day headers as Day N (Weekday). Workout lines: "Exercise: N sets x M reps".',
    DAY_HEADER_PROMPT_RULES,
    EXERCISE_NAME_PROMPT_RULES,
    WORKOUT_SECTION_PROMPT_RULES,
    WORKOUT_VOLUME_PROMPT_RULES,
    PROTEIN_CALORIE_PROMPT_RULES,
    CALORIE_FORMULA_PROMPT_RULES,
    HIGH_FLUX_PHILOSOPHY_RULES,
    HIGH_FLUX_OUTPUT_PAIRING_RULES,
    calorieRules,
    mandatoryCalorieTarget,
    targetsMaintenance
      ? 'MAINTENANCE FOCUS: Rebuild portions to maintenance-level food — generous enough to train and recover. Header, daily totals, and meal lines must all match.'
      : null,
    `- ${CLIENT_PLAN_EDIT_WEEK_RULES}`,
    '- No cross-day references. No weekly progression narrative.',
  ]
    .filter((line): line is string => line != null)
    .join('\n')

  const userPrompt = [
    input.clientName ? `Client: ${input.clientName}` : null,
    '## Client request',
    clientRequest,
    input.coachNote?.trim() ? `\n## Additional context\n${input.coachNote.trim()}` : null,
    '',
    '## Current nutrition plan (background only)',
    input.nutritionText.trim() || '(empty)',
    '',
    '## Current workout plan (background only)',
    input.workoutText.trim() || '(empty)',
  ]
    .filter((line) => line != null)
    .join('\n')

  const providerMode = getPlanProviderMode()
  const started = Date.now()
  const model = MODELS.CLAUDE_SONNET
  const response = await callPlanProvider(providerMode, {
    systemPrompt,
    userPrompt,
    model,
    maxTokens: LIMITS.MAX_SECTION_EDIT_TOKENS,
    temperature: PLAN_GENERATION_TEMPERATURE,
    mockText: JSON.stringify({
      nutritionPlan: buildMockRevision({
        section: 'nutrition',
        currentText: input.nutritionText,
        clientRequest,
        coachNote: input.coachNote,
        clientName: input.clientName,
        clientId: input.clientId,
      }),
      workoutPlan: buildMockRevision({
        section: 'workout',
        currentText: input.workoutText,
        clientRequest,
        coachNote: input.coachNote,
        clientName: input.clientName,
        clientId: input.clientId,
      }),
    }),
  })

  const parsed = extractBothSections(response.text)
  if (!parsed) {
    throw new ClaudeResponseError('AI returned an invalid combined plan edit.')
  }

  const nutritionPlan = syncStoredDietText(
    stripPlanEditMetaLanguage(
      stripClientWeekHandoffLanguage(normalizeAiPlanProse(parsed.nutritionPlan))
    ),
    {
      previousCalories: parseHeaderCalories(input.nutritionText),
      preserveCalories,
      floorKcal: input.profile ? resolveDietFloorKcal(input.profile.weight) : undefined,
    }
  )
  const workoutPlan = stripPlanEditMetaLanguage(
    stripClientWeekHandoffLanguage(normalizeAiPlanProse(parsed.workoutPlan))
  )
  if (!nutritionPlan || !workoutPlan) {
    throw new ClaudeResponseError('AI returned empty section text.')
  }

  const summary = `Rewrote diet and workout from client request.`

  await logAiGeneration({
    clientId: input.clientId ?? null,
    coachId: null,
    action: 'edit_plan_both',
    model: response.model,
    latencyMs: Date.now() - started,
    promptTokens: response.inputTokens,
    completionTokens: response.outputTokens,
    retryCount: 0,
    validationResult: 'ok',
    success: true,
    knowledgeRefs: null,
    renderedOutput: { summary },
  }).catch(() => undefined)

  return {
    nutritionPlan,
    workoutPlan,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    summary,
  }
}
