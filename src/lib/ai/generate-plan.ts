import { ClaudeResponseError } from '@/lib/ai/anthropic'
import {
  DEFAULTS,
  LIMITS,
  PLAN_GENERATION_TEMPERATURE,
  isSupportPlanAction,
  resolvePlanGenerationModel,
} from '@/lib/ai/config'
import { buildMockGeneratedPlan } from '@/lib/ai/mock-plan-provider'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import {
  assessPlanCompleteness,
  resolveExpectedTrainingDays,
} from '@/lib/ai/plan-completeness'
import {
  calculateComplexityScore,
  type ComplexityScoreResult,
} from '@/lib/ai/complexity-score'
import { getAllKnowledge } from '@/lib/ai/knowledge'
import { buildPrompt } from '@/lib/ai/prompt-builder'
import { compileCachedPrompt } from '@/lib/ai/prompt-cache'
import {
  formatLibraryPromptVersion,
  loadPublishedPromptsForAction,
} from '@/lib/ai/prompt-library-loader'
import { extractJsonCandidates, parseJsonFromModelResponse } from '@/lib/ai/json-extract'
import { enforceDietSafety, parseHeaderCalories, syncNutritionPlanMacros } from '@/lib/ai/nutrition-macro-sync'
import { formatCalorieGuidanceBlock } from '@/lib/ai/calorie-targets'
import { SAFE_RATE_OF_CHANGE_RULE } from '@/lib/ai/safe-change-policy'
import {
  DAY_HEADER_PROMPT_RULES,
  EXERCISE_NAME_PROMPT_RULES,
  HIGH_FLUX_OUTPUT_PAIRING_RULES,
  HIGH_FLUX_PHILOSOPHY_RULES,
  PROTEIN_CALORIE_PROMPT_RULES,
  resolveDietFloorKcal,
  WORKOUT_SECTION_PROMPT_RULES,
  WORKOUT_VOLUME_PROMPT_RULES,
} from '@/lib/ai/plan-quality-rules'
import { profileToComplexityInput } from '@/lib/complexity/profile-input'
import {
  getPromptCategoryForAction,
  resolveWorkoutEnvironment,
} from '@/lib/ai/workout-prompt-selection'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import type { Checkin, OnboardingProfile, Plan } from '@/types/database'

export { invalidatePromptCacheForClient, invalidatePromptCacheAll } from '@/lib/ai/prompt-cache'

export type GeneratedWorkoutPlan = {
  overview: string
  days: unknown[]
}

export type GeneratedNutritionPlan = {
  calories: number
  protein: number
  carbs: number
  fat: number
  meals: unknown[]
}

export type GeneratedCardioPlan = {
  sessions: unknown[]
}

export type GeneratedSupplementPlan = {
  items: unknown[]
}

export type GeneratedPlan = {
  workout_plan: GeneratedWorkoutPlan
  nutrition_plan: GeneratedNutritionPlan
  cardio_plan: GeneratedCardioPlan
  supplement_plan: GeneratedSupplementPlan
  coach_notes: string
}

export type GeneratePlanInput = {
  profile: OnboardingProfile
  latestCheckin?: Checkin | null
  coachInstructions?: string | null
  /** Relaxes schema checks for single-section generation (workout/diet/analysis). */
  validationMode?: PlanValidationMode
  actionId?: CoachAiActionId
  /** Current active plan from the database (source of truth for weekly updates). */
  activePlan?: Plan | null
  /** Newly generated diet context for weekly workout updates. */
  updatedDietPlan?: Plan | null
  /** Client journey snapshot (coaching week, missed check-ins, past requests). Appended fresh, never cached. */
  clientJourney?: string | null
  progressImages?: {
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }[]
}

export type PlanValidationMode =
  | 'full'
  | 'workout_focus'
  | 'nutrition_focus'
  | 'cardio_focus'
  | 'supplements_focus'
  | 'minimal'

export type GeneratePlanResult = {
  generatedPlan: GeneratedPlan
  model: string
  complexityScore: ComplexityScoreResult
  estimatedTokens: number
  inputTokens: number
  outputTokens: number
  retryCount: number
  promptVersion: string
}

export class GeneratePlanError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'GeneratePlanError'
  }
}

/** Whether a provider error should consume another generatePlan attempt. */
export function shouldRetryProviderError(
  err: ClaudeResponseError,
  attempt: number,
  maxAttempts: number
): boolean {
  return err.retryable && attempt < maxAttempts - 1
}

/** Keep failure messages short so DB logs / UI are not flooded with raw model output. */
export function formatGeneratePlanFailure(
  providerLabel: string,
  lastValidationError: string,
  lastRawResponse: string,
  previewChars = 500
): string {
  const preview = lastRawResponse.trim().slice(0, previewChars)
  const suffix = preview
    ? ` Raw response preview: ${preview}${lastRawResponse.trim().length > previewChars ? '…' : ''}`
    : ''
  return `${providerLabel} returned invalid plan JSON after retry: ${lastValidationError}.${suffix}`
}

const PLAN_JSON_SCHEMA = `{
  "workout_plan": {
    "overview": "",
    "days": []
  },
  "nutrition_plan": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "meals": []
  },
  "cardio_plan": {
    "sessions": []
  },
  "supplement_plan": {
    "items": []
  },
  "coach_notes": ""
}`

const PLAN_OUTPUT_INSTRUCTIONS = [
  '# Plan Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no preamble.',
  'The JSON must match this exact top-level structure:',
  PLAN_JSON_SCHEMA,
  '- workout_plan.overview must be a non-empty string.',
  '- workout_plan.days must be an array of training day objects.',
  '- nutrition_plan macros must be positive numbers appropriate for the client.',
  '- nutrition_plan.meals must be an array of meal objects.',
  '- cardio_plan.sessions must be an array.',
  '- supplement_plan.items must be an array.',
  '- coach_notes must be a string summarizing key coaching priorities.',
].join('\n')

const PLAN_TASK_INSTRUCTIONS = [
  '## Plan Generation Task',
  'Generate a complete, personalized coaching plan for this client.',
  'Include workout programming, nutrition targets with meals, cardio recommendations,',
  'supplement suggestions (if appropriate), and coach notes.',
  'Return ONLY the JSON object described in the system prompt.',
].join('\n')

const RETRY_INSTRUCTIONS = [
  'Your previous response failed validation.',
  'Return ONLY a corrected JSON object with no extra text and no markdown fences.',
  'Escape all newlines inside JSON strings as \\n. Ensure the JSON parses cleanly.',
  'If this is a diet plan: include Day 1 (Monday) through Day 7 (Sunday) as separate labeled day sections with meals under each day. Do not skip days. Never use a bare weekday or a bare Day N without the weekday in parentheses.',
  'If this is a workout plan: include every required day labeled Day 1 (Monday), Day 2 (Tuesday), … Day 7 (Sunday) with exercises on training days. Do not leave empty day sections. Never use a bare weekday or a bare Day N without the weekday in parentheses.',
].join(' ')

const COMPLETENESS_RETRY_PREFIX =
  'COMPLETENESS FIX REQUIRED: The previous plan was incomplete. '

const CLIENT_FACING_PLAN_STYLE_INSTRUCTIONS = [
  '# Client-Facing Writing Style',
  'Write every client-facing plan field in natural, coach-written plain text.',
  'Do not use Markdown formatting, asterisks, star bullets, or hyphen bullets.',
  'Never use hyphen (-), en dash, or em dash characters anywhere in client-facing text. Write "10 to 15" not "10-15", "well balanced" not "well-balanced", and use commas or new sentences instead of dashes.',
  'Do not wrap headings or phrases in special formatting characters.',
  'Use simple section titles and normal sentences. When listing items, place each item on its own line without a symbol prefix.',
  'Keep the tone practical, personal, and human. Avoid robotic labels, filler, and AI-style commentary.',
].join('\n')

const LIBRARY_DIET_OUTPUT_INSTRUCTIONS = [
  '# Plan Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no preamble.',
  'The JSON must match this exact top-level structure:',
  PLAN_JSON_SCHEMA,
  '- Put the full client-facing diet plan prose in nutrition_plan.meals as ONE item: { "meal": "Weekly Diet Plan", "example": "<entire copy-paste diet plan>" }.',
  '- CRITICAL: The diet prose MUST include all 7 days as separate labeled sections: Day 1 (Monday) through Day 7 (Sunday). Never skip a day. Never write "same every day" without repeating the full day blocks.',
  DAY_HEADER_PROMPT_RULES,
  '- Each day section must include breakfast, lunch, dinner, and snacks with concrete foods and approximate portions.',
  '- Set nutrition_plan.calories, protein, carbs, and fat to the rounded AVERAGE daily totals from the 7-day plan (sum each day, divide by 7). NEVER use 0 or placeholder values.',
  '- Header macros MUST match the meal plan: if meals show (P: Xg | C: Yg | F: Zg | ~K kcal) lines, totals must reflect those sums. Count only the primary option per meal, never primary plus swap.',
  '- Include a clear daily average line in the prose, e.g. "Daily averages: ~1850 kcal | P: 95g | C: 200g | F: 55g" matching the header fields. Protein in that line is the honest food sum, not a prettier higher number.',
  '- CALORIE CONSISTENCY: any calorie number you state in the conversational note (e.g. "I\'m giving you ~1850 calories this week") MUST equal the daily average and the header calories. Never state a different daily calorie target in the prose than the food math produces. If you mention a deficit/surplus, phrase it as a change (e.g. "about 150 kcal lower than last week") — do not state a second daily total.',
  SAFE_RATE_OF_CHANGE_RULE,
  HIGH_FLUX_PHILOSOPHY_RULES,
  HIGH_FLUX_OUTPUT_PAIRING_RULES,
  PROTEIN_CALORIE_PROMPT_RULES,
  '- Write a complete 7-day diet. Use the full output budget. Do not skip days or thin out meals to save tokens.',
  '- Never write "Welcome to week N" as a greeting in diet prose. You MAY label the plan header with Week N so the client can see which coaching week this is.',
  '- Diet text must contain ONLY food / nutrition. Never include Cardio, Steps, Conditioning, or Supplements sections in the diet prose.',
  '- Every day under a Day N header must include the FULL meal list written out in actual words with portions, cooking fats, and macro lines.',
  '- NEVER use cross-day references such as "same as Day 1", "repeat Day 2", "follow Day 1", "as above", or "use Monday\'s plan". If a day intentionally mirrors another day, rewrite that day\'s complete meals again under the new day header. The daily tracker cannot resolve day-to-day pointers.',
  '- Set workout_plan.overview to "N/A" and workout_plan.days to [].',
  '- cardio_plan.sessions MUST be [].',
  '- supplement_plan.items MUST be [].',
  '- coach_notes must be empty unless you held calories at the platform kcal floor as an exception — then one short coach flag only, under 200 characters.',
].join('\n')

const LIBRARY_WORKOUT_OUTPUT_INSTRUCTIONS = [
  '# Plan Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no preamble.',
  'The JSON must match this exact top-level structure:',
  PLAN_JSON_SCHEMA,
  '- Put the full client-facing workout plan prose in workout_plan.overview.',
  '- workout_plan.overview must include exercises, sets, reps, and weekly structure — not internal coach analysis.',
  '- DAILY TRACKER COMPATIBILITY (required): the client app parses workout_plan.overview into tracker fields.',
  '- Use "sets x reps" format with a plain letter x (e.g. "Barbell Bench Press: 3 sets x 8 reps" or "3 sets x 6 to 8 reps"). Prefer "Exercise: N sets x M reps".',
  '- The text before the colon MUST be a real movement name (Goblet Squat, Barbell Bench Press, Romanian Deadlift). Never a goal sentence ("Core endurance for the full race effort") and never a muscle-group-only line ("Lower", "Upper Push").',
  EXERCISE_NAME_PROMPT_RULES,
  '- For timed work use "Exercise: N sets x M sec" or "Exercise: M min".',
  DAY_HEADER_PROMPT_RULES,
  '- Example training header: "Day 1 (Monday): Lower Power". Label rest and recovery days the same way (e.g. "Day 3 (Wednesday): Rest").',
  '- Prefer also filling workout_plan.days with one object per day (day, focus, exercises) using the same Day N (Weekday) labels.',
  '- Never write "Welcome to week N" as a greeting in workout prose. You MAY label the plan header with Week N.',
  '- Main body is strength / resistance training. You MAY weave a one-line daily step target and a short sleep note. Never add Cardio, Conditioning, or Supplements section headers, and do not write a full cardio or supplement program here (those are generated separately).',
  '- Every training day must list every exercise with sets x reps (or duration) in full under that day header — one exercise per line.',
  '- NEVER use cross-day references such as "same as Day 1", "repeat Day 2", "follow Thursday\'s workout", or "as above". If two days share a session, rewrite the complete exercise list under both headers. The daily tracker cannot resolve day-to-day pointers.',
  '- Keep each day self-contained: Warm-up, Main Workout, then that day\'s Post-Workout stretches. Do NOT put the next day\'s lifts under Post-Workout / Recovery / Stretching of the previous day.',
  WORKOUT_SECTION_PROMPT_RULES,
  '- Do not use a lone line "Recovery" or "Stretching" between days — that can make the tracker swallow the next session into Post-Workout. Use "Post-Workout:" only for cooldown stretches of the CURRENT day. Never a shared warmup before Day 1 or a shared stretch list after the week.',
  '- Do not hide the working sets inside paragraph prose only; the tracker needs scannable exercise lines.',
  WORKOUT_VOLUME_PROMPT_RULES,
  HIGH_FLUX_OUTPUT_PAIRING_RULES,
  '- Write a complete week. Use the full output budget. Do not skip days or drop exercises to save tokens.',
  '- Set nutrition_plan calories/protein/carbs/fat to 0 and nutrition_plan.meals to [].',
  '- cardio_plan.sessions MUST be [].',
  '- supplement_plan.items MUST be [].',
  '- coach_notes must be an empty string or under 200 characters.',
  '- Escape all newlines inside JSON string values as \\n. Never use literal line breaks inside JSON strings.',
].join('\n')

const LIBRARY_CARDIO_OUTPUT_INSTRUCTIONS = [
  '# Plan Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no preamble.',
  'The JSON must match this exact top-level structure:',
  PLAN_JSON_SCHEMA,
  '- Put the full client-facing cardio plan in cardio_plan.sessions (non-empty).',
  '- Each session object should include type/name, duration, frequency, and optional intensity/notes.',
  '- Cover walking/steps, LISS, and any HIIT or conditioning appropriate for the client.',
  '- Include a daily steps target and a short water/sleep reminder in the cardio notes, matched to how many days they actually hit steps.',
  '- Set workout_plan.overview to "N/A" and workout_plan.days to [].',
  '- Set nutrition_plan calories/protein/carbs/fat to 0 and nutrition_plan.meals to [].',
  '- supplement_plan.items MUST be [].',
  '- coach_notes must be an empty string or under 200 characters.',
].join('\n')

const LIBRARY_SUPPLEMENT_OUTPUT_INSTRUCTIONS = [
  '# Plan Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no preamble.',
  'The JSON must match this exact top-level structure:',
  PLAN_JSON_SCHEMA,
  '- Put the full client-facing supplement plan in supplement_plan.items (non-empty unless truly none are appropriate).',
  '- Each item should include name, dose/dosage, and optional notes (timing, optional vs required).',
  '- Set workout_plan.overview to "N/A" and workout_plan.days to [].',
  '- Set nutrition_plan calories/protein/carbs/fat to 0 and nutrition_plan.meals to [].',
  '- cardio_plan.sessions MUST be [].',
  '- coach_notes must be an empty string or under 200 characters.',
].join('\n')

function dedicatedSupportPlanTemplate(actionId?: CoachAiActionId): string | null {
  if (actionId === 'initial_cardio' || actionId === 'review_update_cardio') {
    return [
      'Create a standalone cardio / steps / conditioning plan for this client.',
      'Fill cardio_plan.sessions with concrete sessions (type, duration, frequency, intensity).',
      'Do not write a strength workout or diet.',
      'Leave workout_plan overview as N/A, nutrition meals empty, and supplement_plan.items empty.',
    ].join(' ')
  }
  if (actionId === 'initial_supplements' || actionId === 'review_update_supplements') {
    return [
      'Create a standalone supplement plan for this client.',
      'Fill supplement_plan.items with name, dose, and timing notes.',
      'If no supplements are appropriate, return items: [] and explain nothing else.',
      'Do not write a diet meal plan or workout.',
      'Leave workout_plan overview as N/A, nutrition meals empty, and cardio_plan.sessions empty.',
    ].join(' ')
  }
  return null
}

function resolvePlanOutputInstructions(options: {
  useLibraryTemplate: boolean
  actionId?: CoachAiActionId
  validationMode?: PlanValidationMode
}): string | null {
  if ((options.validationMode ?? 'full') === 'minimal') return null
  if (!options.useLibraryTemplate) return PLAN_OUTPUT_INSTRUCTIONS

  switch (options.actionId) {
    case 'initial_diet':
    case 'review_update_diet':
      return LIBRARY_DIET_OUTPUT_INSTRUCTIONS
    case 'initial_workout':
    case 'review_update_workout':
      return LIBRARY_WORKOUT_OUTPUT_INSTRUCTIONS
    case 'initial_cardio':
    case 'review_update_cardio':
      return LIBRARY_CARDIO_OUTPUT_INSTRUCTIONS
    case 'initial_supplements':
    case 'review_update_supplements':
      return LIBRARY_SUPPLEMENT_OUTPUT_INSTRUCTIONS
    default:
      return PLAN_OUTPUT_INSTRUCTIONS
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export { profileToComplexityInput } from '@/lib/complexity/profile-input'

/** Strip markdown code fences and extract JSON payload from model text. */
export function extractJsonFromResponse(text: string): string {
  const candidates = extractJsonCandidates(text)
  if (candidates.length > 0) return candidates[0]!

  const trimmed = text.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

/** Validate parsed JSON against the required generated plan schema. */
export function validateGeneratedPlan(
  value: unknown,
  options?: { mode?: PlanValidationMode }
): { plan: GeneratedPlan | null; error: string | null } {
  const mode = options?.mode ?? 'full'
  const allowPlaceholderNutrition =
    mode === 'workout_focus' ||
    mode === 'nutrition_focus' ||
    mode === 'cardio_focus' ||
    mode === 'supplements_focus' ||
    mode === 'minimal'
  const allowPlaceholderWorkout =
    mode === 'nutrition_focus' ||
    mode === 'cardio_focus' ||
    mode === 'supplements_focus' ||
    mode === 'minimal'
  if (!isRecord(value)) {
    return { plan: null, error: 'Response is not a JSON object.' }
  }

  const workout = value.workout_plan
  if (!isRecord(workout)) return { plan: null, error: 'Missing or invalid workout_plan.' }
  if (!isString(workout.overview) || !workout.overview.trim()) {
    return { plan: null, error: 'workout_plan.overview must be a non-empty string.' }
  }
  if (!allowPlaceholderWorkout && workout.overview.trim().toUpperCase() === 'N/A') {
    return { plan: null, error: 'workout_plan.overview must contain the workout plan content.' }
  }
  if (!isArray(workout.days)) return { plan: null, error: 'workout_plan.days must be an array.' }

  const nutrition = value.nutrition_plan
  if (!isRecord(nutrition)) return { plan: null, error: 'Missing or invalid nutrition_plan.' }
  if (!isNumber(nutrition.calories) || (allowPlaceholderNutrition ? nutrition.calories < 0 : nutrition.calories <= 0)) {
    return {
      plan: null,
      error: allowPlaceholderNutrition
        ? 'nutrition_plan.calories must be a non-negative number.'
        : 'nutrition_plan.calories must be a positive number.',
    }
  }
  if (!isNumber(nutrition.protein) || nutrition.protein < 0) {
    return { plan: null, error: 'nutrition_plan.protein must be a non-negative number.' }
  }
  if (!isNumber(nutrition.carbs) || nutrition.carbs < 0) {
    return { plan: null, error: 'nutrition_plan.carbs must be a non-negative number.' }
  }
  if (!isNumber(nutrition.fat) || nutrition.fat < 0) {
    return { plan: null, error: 'nutrition_plan.fat must be a non-negative number.' }
  }
  if (!isArray(nutrition.meals)) return { plan: null, error: 'nutrition_plan.meals must be an array.' }
  if (mode === 'nutrition_focus') {
    const hasMealContent = nutrition.meals.some((meal) => {
      if (!isRecord(meal)) return false
      const example = meal.example ?? meal.description ?? meal.content
      return typeof example === 'string' && example.trim().length > 80
    })
    if (!hasMealContent) {
      return {
        plan: null,
        error: 'nutrition_plan.meals must include one item with the full diet plan prose.',
      }
    }
  }

  const cardio = value.cardio_plan
  if (!isRecord(cardio)) return { plan: null, error: 'Missing or invalid cardio_plan.' }
  if (!isArray(cardio.sessions)) return { plan: null, error: 'cardio_plan.sessions must be an array.' }

  const supplements = value.supplement_plan
  if (!isRecord(supplements)) return { plan: null, error: 'Missing or invalid supplement_plan.' }
  if (!isArray(supplements.items)) return { plan: null, error: 'supplement_plan.items must be an array.' }
  // Empty cardio/supplement arrays are allowed; dedicated support prompts still push for content.

  if (!isString(value.coach_notes)) {
    return { plan: null, error: 'coach_notes must be a string.' }
  }

  return {
    plan: {
      workout_plan: {
        overview: workout.overview.trim(),
        days: workout.days,
      },
      nutrition_plan: {
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        meals: nutrition.meals,
      },
      cardio_plan: { sessions: cardio.sessions },
      supplement_plan: { items: supplements.items },
      coach_notes: value.coach_notes,
    },
    error: null,
  }
}

/** Parse and validate model text into a GeneratedPlan. */
export function parseGeneratedPlanResponse(
  text: string,
  options?: { mode?: PlanValidationMode }
): { plan: GeneratedPlan | null; error: string | null } {
  const { parsed, error: parseError } = parseJsonFromModelResponse(text)
  if (parseError || parsed === null) {
    return { plan: null, error: parseError ?? 'Response is not valid JSON.' }
  }

  const { plan, error } = validateGeneratedPlan(parsed, options)
  if (!plan) return { plan: null, error }

  const mode = options?.mode ?? 'full'
  if (mode === 'nutrition_focus' || mode === 'full') {
    const syncedNutrition = syncNutritionPlanMacros(plan.nutrition_plan)
    const syncedPlan = { ...plan, nutrition_plan: syncedNutrition }

    if (
      (mode === 'nutrition_focus' || mode === 'full') &&
      syncedNutrition.calories <= 0
    ) {
      return {
        plan: null,
        error:
          'nutrition_plan.calories must be a positive number matching the meal plan totals (never 0).',
      }
    }

    return { plan: syncedPlan, error: null }
  }

  return { plan, error: null }
}

async function buildPlanPrompts(
  profile: OnboardingProfile,
  latestCheckin: Checkin | null | undefined,
  complexityScore: ComplexityScoreResult,
  knowledgeEntries: Awaited<ReturnType<typeof getAllKnowledge>>['data'],
  coachInstructions: string | null | undefined,
  options: {
    retry?: boolean
    completenessHint?: string | null
    activePlan?: Plan | null
    updatedDietPlan?: Plan | null
    libraryPrompts?: {
      actionTemplate: string
      systemTemplate: string | null
    }
    validationMode?: PlanValidationMode
    actionId?: CoachAiActionId
    promptVersion?: string
    clientJourney?: string | null
  } = {}
) {
  const { result: base, report } = await compileCachedPrompt({
    profile,
    latestCheckin,
    complexityScore,
    knowledgeEntries,
    coachInstructions,
    activePlan: options.activePlan,
    updatedDietPlan: options.updatedDietPlan,
    actionId: options.actionId,
    actionTemplate: options.libraryPrompts?.actionTemplate ?? null,
    systemTemplate: options.libraryPrompts?.systemTemplate ?? null,
    clientId: profile.id,
    promptVersion: options.promptVersion,
    retry: options.retry,
  })

  void report

  const useLibraryTemplate = Boolean(options.libraryPrompts?.actionTemplate)
  const outputInstructions = resolvePlanOutputInstructions({
    useLibraryTemplate,
    actionId: options.actionId,
    validationMode: options.validationMode,
  })

  const includesDietOutput =
    options.validationMode === 'nutrition_focus' ||
    options.validationMode === 'full' ||
    options.actionId === 'initial_diet' ||
    options.actionId === 'review_update_diet'
  const mandatoryCalorieTarget = includesDietOutput
    ? formatCalorieGuidanceBlock(profile)
    : null

  const systemPrompt = [
    base.systemPrompt,
    outputInstructions,
    mandatoryCalorieTarget,
    CLIENT_FACING_PLAN_STYLE_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join('\n\n')

  const userPrompt = [
    base.userPrompt,
    // Journey snapshot is appended fresh (not block-cached) so week/skip/request context is never stale.
    options.clientJourney?.trim() ? options.clientJourney.trim() : null,
    useLibraryTemplate ? null : PLAN_TASK_INSTRUCTIONS,
    options.retry ? RETRY_INSTRUCTIONS : null,
    options.completenessHint
      ? `${COMPLETENESS_RETRY_PREFIX}${options.completenessHint}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    systemPrompt,
    userPrompt,
    estimatedTokens: base.estimatedTokens,
  }
}

/**
 * Full AI plan generation pipeline.
 * Does not persist results — returns validated plan JSON only.
 * Provider selection (mock vs Claude) is isolated in plan-provider.ts.
 */
export async function generatePlan(input: GeneratePlanInput): Promise<GeneratePlanResult> {
  const providerMode = getPlanProviderMode()
  const complexityScore = calculateComplexityScore(
    profileToComplexityInput(input.profile, input.latestCheckin)
  )

  const { data: knowledgeEntries, error: knowledgeError } = await getAllKnowledge()
  if (knowledgeError) {
    throw new GeneratePlanError(`Failed to load knowledge base: ${knowledgeError}`)
  }

  const model = resolvePlanGenerationModel({
    actionId: input.actionId,
    recommendedModel: complexityScore.recommendedModel,
  })
  const supportSection = isSupportPlanAction(input.actionId)
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let lastValidationError = 'Unknown validation error.'
  let lastRawResponse = ''
  // Support sections soft-fail upstream — one attempt avoids a second expensive call.
  // Diet/workout get a third attempt when days are missing or output truncates.
  const maxTokens = supportSection ? LIMITS.MAX_SUPPORT_PLAN_TOKENS : LIMITS.MAX_PLAN_TOKENS
  const validationMode = input.validationMode ?? 'full'
  const maxAttempts =
    providerMode === 'mock'
      ? 1
      : supportSection
        ? 1
        : validationMode === 'nutrition_focus' || validationMode === 'full'
          ? 4
          : 3

  let libraryPrompts: { actionTemplate: string; systemTemplate: string | null } | undefined
  let promptVersion = process.env.AI_PROMPT_VERSION?.trim() || 'v1'

  if (input.actionId) {
    const loaded = await loadPublishedPromptsForAction(input.actionId, input.profile)
    if (!loaded) {
      const category = getPromptCategoryForAction(input.actionId, input.profile)
      throw new GeneratePlanError(
        `No published Prompt Library entry for category "${category}" (action "${input.actionId}"). Publish the prompt in Admin → Prompt Library.`
      )
    }
    const dedicatedActionTemplate = dedicatedSupportPlanTemplate(input.actionId)
    libraryPrompts = {
      // Cardio/supplements reuse diet/workout library categories for context only —
      // replace the action body so it does not instruct empty cardio/supplement arrays.
      actionTemplate: dedicatedActionTemplate ?? loaded.action.promptBody,
      systemTemplate: loaded.system?.promptBody ?? null,
    }
    promptVersion = formatLibraryPromptVersion(loaded.action)
    if (loaded.system) {
      promptVersion = `${promptVersion}+${formatLibraryPromptVersion(loaded.system)}`
    }
    if (dedicatedActionTemplate) {
      promptVersion = `${promptVersion}+support-plan-v1`
    }
  }

  const workoutEnvironment = resolveWorkoutEnvironment(input.profile)
  const expectedTrainingDays = resolveExpectedTrainingDays(
    input.profile.onboarding_data?.training?.daysPerWeek,
    workoutEnvironment
  )
  let completenessHint: string | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prompts = await buildPlanPrompts(
      input.profile,
      input.latestCheckin,
      complexityScore,
      knowledgeEntries,
      input.coachInstructions,
      {
        retry: attempt > 0,
        completenessHint: attempt > 0 ? completenessHint : null,
        activePlan: input.activePlan,
        updatedDietPlan: input.updatedDietPlan,
        libraryPrompts,
        validationMode,
        actionId: input.actionId,
        promptVersion,
        clientJourney: input.clientJourney,
      }
    )

    const mockText =
      providerMode === 'mock'
        ? JSON.stringify(
            buildMockGeneratedPlan(
              input.profile,
              input.latestCheckin,
              input.coachInstructions
            )
          )
        : undefined

    let response
    try {
      response = await callPlanProvider(providerMode, {
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt,
        model,
        maxTokens,
        temperature: supportSection ? DEFAULTS.DEFAULT_TEMPERATURE : PLAN_GENERATION_TEMPERATURE,
        mockText,
        images: input.progressImages,
      })
    } catch (err) {
      if (err instanceof ClaudeResponseError) {
        const detail = err.status ? ` (HTTP ${err.status})` : ''
        lastValidationError = `Anthropic plan generation failed${detail}: ${err.message}`
        // Transient/quota blips used to abort the whole generatePlan call even when
        // validation retries remained — retry those in this outer loop.
        if (shouldRetryProviderError(err, attempt, maxAttempts)) {
          completenessHint =
            'Previous provider call failed transiently. Generate the complete plan again from scratch.'
          continue
        }
        throw new GeneratePlanError(lastValidationError, { cause: err })
      }
      throw err
    }

    totalInputTokens += response.inputTokens
    totalOutputTokens += response.outputTokens
    lastRawResponse = response.text

    if (!response.text?.trim()) {
      lastValidationError = 'Model returned an empty plan response.'
      completenessHint =
        'Previous response was empty. Return ONLY the complete JSON plan object with every required day.'
      continue
    }

    if (response.stopReason === 'max_tokens') {
      lastValidationError =
        'Plan response was truncated (hit max output tokens). Retrying with a complete week required.'
      completenessHint =
        'Previous output was cut off. Write the COMPLETE plan with every required day. Use the full output budget for a better plan. Cut only fluff commentary if space is tight — never skip days or meals.'
      continue
    }

    const parsed = parseGeneratedPlanResponse(response.text, {
      mode: validationMode,
    })
    if (!parsed.plan) {
      lastValidationError = parsed.error ?? 'Invalid plan JSON.'
      completenessHint = null
      continue
    }

    let plan = parsed.plan

    if (!supportSection && providerMode !== 'mock') {
      const completeness = assessPlanCompleteness(plan, {
        mode: validationMode,
        expectedTrainingDays,
        workoutEnvironment,
      })
      if (!completeness.ok) {
        lastValidationError = completeness.error ?? 'Plan incomplete.'
        completenessHint = completeness.error
        continue
      }
    }

    // Force the non-negotiable diet numbers (floor + no large weekly swing) on diet generations.
    // Retry on violation; on the final attempt keep the best draft so the client still gets a plan
    // (these flows land as coach-review drafts, not auto-published).
    const enforcesDiet = validationMode === 'nutrition_focus' || validationMode === 'full'
    if (enforcesDiet && !supportSection && providerMode !== 'mock') {
      const floorKcal = resolveDietFloorKcal(input.profile.weight)
      const previousCalories = parseHeaderCalories(input.activePlan?.nutrition_plan)
      const safety = enforceDietSafety(plan.nutrition_plan, {
        previousCalories,
        floorKcal,
      })
      if (!safety.ok) {
        lastValidationError = safety.error
        if (attempt < maxAttempts - 1) {
          completenessHint = safety.hint
          continue
        }
        throw new GeneratePlanError(
          `Diet plan failed calorie safety after ${maxAttempts} attempts: ${safety.error}`
        )
      }
    }

    return {
      generatedPlan: plan,
      model: response.model,
      complexityScore,
      estimatedTokens: prompts.estimatedTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      retryCount: attempt,
      promptVersion,
    }
  }

  const providerLabel = providerMode === 'mock' ? 'Mock provider' : 'Anthropic'
  throw new GeneratePlanError(
    formatGeneratePlanFailure(providerLabel, lastValidationError, lastRawResponse)
  )
}
