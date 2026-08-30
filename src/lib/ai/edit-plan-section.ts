import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { LIMITS, MODELS, PLAN_GENERATION_TEMPERATURE } from '@/lib/ai/config'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import {
  DAY_HEADER_PROMPT_RULES,
  EDIT_CALORIE_PRESERVATION_RULES,
  EDIT_EXPENDITURE_FIRST_RULES,
  EXERCISE_NAME_PROMPT_RULES,
  HIGH_FLUX_PHILOSOPHY_RULES,
  PROTEIN_CALORIE_PROMPT_RULES,
  WORKOUT_SECTION_PROMPT_RULES,
  WORKOUT_VOLUME_PROMPT_RULES,
} from '@/lib/ai/plan-quality-rules'
import { normalizeAiPlanProse } from '@/lib/ai/plan-format'
import {
  clientRequestNeedsExpenditureFocus,
  clientRequestTouchesCalories,
} from '@/lib/ai/calorie-targets'
import {
  parseHeaderCalories,
  stabilizeDietCaloriesAfterEdit,
} from '@/lib/ai/nutrition-macro-sync'
import { SAFE_RATE_OF_CHANGE_RULE } from '@/lib/ai/safe-change-policy'
import {
  CLIENT_PLAN_EDIT_WEEK_RULES,
  stripClientWeekHandoffLanguage,
} from '@/lib/ai/plan-prose-guards'
import { logAiGeneration } from '@/lib/ai/trace-log'

export type PlanSectionKind = 'nutrition' | 'workout'

export type EditPlanSectionInput = {
  section: PlanSectionKind
  currentText: string
  clientRequest: string
  coachNote?: string | null
  clientName?: string | null
  clientId?: string
  previousCalories?: number | null
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

function buildMockRevision(input: EditPlanSectionInput): string {
  const note = input.coachNote?.trim()
  const header = [
    `Updated ${sectionLabel(input.section)} (mock)`,
    `Client request: ${input.clientRequest.trim()}`,
    note ? `Coach note: ${note}` : null,
    '',
  ]
    .filter(Boolean)
    .join('\n')

  const body = input.currentText.trim() || `(No prior ${sectionLabel(input.section)} — add structure here.)`
  return `${header}\n${body}\n\n[Apply coach edits: honor the request while keeping day structure and clear exercise/meal lines.]`
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
  const clientRequest = input.clientRequest.trim()
  if (!clientRequest) {
    throw new Error('Client request is required.')
  }

  const section = sectionLabel(input.section)
  const needsExpenditure = clientRequestNeedsExpenditureFocus(clientRequest)
  const touchesCalories =
    input.section === 'nutrition' &&
    clientRequestTouchesCalories(clientRequest) &&
    !needsExpenditure
  const preserveCalories = !touchesCalories || needsExpenditure
  const calorieRules = needsExpenditure
    ? EDIT_EXPENDITURE_FIRST_RULES
    : touchesCalories
      ? SAFE_RATE_OF_CHANGE_RULE
      : EDIT_CALORIE_PRESERVATION_RULES
  const systemPrompt = [
    'You are an expert fitness coach editor doing an IN-PLACE edit of the client\'s current plan.',
    `Revise the client's ${section} based on the client's request.`,
    'Rules:',
    '- This is NOT a weekly plan update. Do not design "next week". Edit the CURRENT plan text.',
    '- Preserve useful structure: day headers should stay as Day N (Weekday) with Day 1 = Monday (e.g. Day 1 (Monday)), meal names, exercise lines with sets x reps (plain letter x).',
    DAY_HEADER_PROMPT_RULES,
    touchesCalories
      ? '- Apply the client request with clear, targeted edits in the affected meals/exercises only.'
      : '- Apply the client request with minimal edits — change only what they asked for. A near-copy of unchanged days is correct.',
    '- Make only the changes needed to satisfy the request — keep calories/macros/split/days the same unless the request requires changing them.',
    calorieRules,
    HIGH_FLUX_PHILOSOPHY_RULES,
    '- Do not rewrite unrelated days, invent a new program phase, or add weekly progression narrative.',
    '- If the request names specific foods, exercises, days, or constraints, those must appear differently in the revised text.',
    '- Keep language natural, human, and coach-ready in plain text, not JSON.',
    '- Do not use Markdown, asterisks, star bullets, or hyphen bullets.',
    '- Use plain section titles and put list items on separate lines without symbol prefixes.',
    '- For workout sections: one exercise per line under each day header as "Exercise: N sets x M reps" (or timed duration). The name before the colon must be a real lift or movement, not a coaching sentence or a muscle-group-only label. The daily tracker parses these lines.',
    EXERCISE_NAME_PROMPT_RULES,
    WORKOUT_SECTION_PROMPT_RULES,
    WORKOUT_VOLUME_PROMPT_RULES,
    '- For nutrition sections: if protein is hard to hit with allowed foods, lower protein and keep calories high. Never inflate protein numbers. Daily totals count only the primary meal option. Minimum 1800 kcal unless the coach already set otherwise.',
    PROTEIN_CALORIE_PROMPT_RULES,
    '- Do not invent unsafe extreme restrictions or medical claims.',
    '- Never introduce cross-day references ("same as Day 1", "repeat Day 2", "follow Day 3\'s plan", "as above"). Every day must keep its full meal or exercise list written out so the daily tracker can parse it.',
    '- Never put the next day\'s exercises under Post-Workout / Recovery / Stretching of the previous day.',
    '- If the request asks one day to mirror another, copy the full content under both day headers instead of pointing between days.',
    `- ${CLIENT_PLAN_EDIT_WEEK_RULES}`,
    '- Optional short opener (1 to 2 sentences) may name what changed. Then output the full revised section. No week greeting, no "next week" coaching speech.',
  ].join('\n')

  const userPrompt = [
    input.clientName ? `Client: ${input.clientName}` : null,
    `Section: ${section}`,
    'Task: in-place edit of the CURRENT plan (not a new week).',
    '',
    '## Client request (apply these changes only)',
    clientRequest,
    input.coachNote?.trim() ? `\n## Extra coach guidance\n${input.coachNote.trim()}` : null,
    '',
    '## Current plan text (edit this; keep unrequested parts)',
    currentText || '(empty — create a solid starter section that matches the request)',
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
          ? '\n\n## Retry instruction\nPrevious output was too similar to the current plan or truncated. Rewrite the COMPLETE section with clear, visible changes that satisfy the client request. No cross-day references and no preamble.'
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

      const revisedRaw = stripClientWeekHandoffLanguage(
        normalizeAiPlanProse(extractRevisedText(response.text))
      )
      if (!revisedRaw) {
        if (attempt < maxAttempts - 1) continue
        throw new ClaudeResponseError('AI returned an empty revision.')
      }

      const revisedText =
        input.section === 'nutrition'
          ? stabilizeDietCaloriesAfterEdit(revisedRaw, {
              previousCalories:
                input.previousCalories ?? parseHeaderCalories(currentText),
              preserveCalories,
            })
          : revisedRaw

      // Reject near-copies only when the client asked for a broad rewrite (not a single food swap).
      if (currentText && attempt === 0 && touchesCalories) {
        const similarity = planTextSimilarityLocal(currentText, revisedText)
        if (similarity >= 0.93) {
          continue
        }
      }

      const summary = `Updated ${section} from client request (${revisedText.length} chars).`

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
      clientName: input.clientName,
      clientId: input.clientId,
      previousCalories: parseHeaderCalories(input.nutritionText),
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

  const needsExpenditure = clientRequestNeedsExpenditureFocus(clientRequest)
  const touchesCalories = clientRequestTouchesCalories(clientRequest) && !needsExpenditure
  const preserveCalories = !touchesCalories || needsExpenditure
  const calorieRules = needsExpenditure
    ? EDIT_EXPENDITURE_FIRST_RULES
    : touchesCalories
      ? SAFE_RATE_OF_CHANGE_RULE
      : EDIT_CALORIE_PRESERVATION_RULES
  const systemPrompt = [
    'You are an expert fitness coach editor doing an IN-PLACE edit of the client\'s current plan.',
    'Revise diet and workout sections based on the client request in ONE response.',
    'Output ONLY valid JSON with keys "nutritionPlan" and "workoutPlan" (plain text values, no markdown fences).',
    'Rules:',
    '- This is NOT a weekly plan update. Edit the CURRENT plan text only.',
    touchesCalories
      ? '- Apply clear edits for the request; keep unrequested days/meals/exercises unchanged.'
      : '- Apply minimal edits for the request; unchanged days may stay identical.',
    '- Preserve day headers as Day N (Weekday). Workout lines: "Exercise: N sets x M reps".',
    DAY_HEADER_PROMPT_RULES,
    EXERCISE_NAME_PROMPT_RULES,
    WORKOUT_SECTION_PROMPT_RULES,
    WORKOUT_VOLUME_PROMPT_RULES,
    PROTEIN_CALORIE_PROMPT_RULES,
    HIGH_FLUX_PHILOSOPHY_RULES,
    calorieRules,
    `- ${CLIENT_PLAN_EDIT_WEEK_RULES}`,
    '- No cross-day references. No weekly progression narrative.',
  ].join('\n')

  const userPrompt = [
    input.clientName ? `Client: ${input.clientName}` : null,
    '## Client request',
    clientRequest,
    input.coachNote?.trim() ? `\n## Extra coach guidance\n${input.coachNote.trim()}` : null,
    '',
    '## Current nutrition plan',
    input.nutritionText.trim() || '(empty)',
    '',
    '## Current workout plan',
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

  const nutritionPlan = stabilizeDietCaloriesAfterEdit(
    stripClientWeekHandoffLanguage(normalizeAiPlanProse(parsed.nutritionPlan)),
    {
      previousCalories: parseHeaderCalories(input.nutritionText),
      preserveCalories,
    }
  )
  const workoutPlan = stripClientWeekHandoffLanguage(normalizeAiPlanProse(parsed.workoutPlan))
  if (!nutritionPlan || !workoutPlan) {
    throw new ClaudeResponseError('AI returned empty section text.')
  }

  const summary = `Updated diet and workout from client request.`

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
