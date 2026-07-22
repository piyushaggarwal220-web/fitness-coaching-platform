import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { DEFAULTS, LIMITS } from '@/lib/ai/config'
import { buildMockGeneratedPlan } from '@/lib/ai/mock-plan-provider'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
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
import { syncNutritionPlanMacros } from '@/lib/ai/nutrition-macro-sync'
import { profileToComplexityInput } from '@/lib/complexity/profile-input'
import { getPromptCategoryForAction } from '@/lib/ai/workout-prompt-selection'
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
  'Your previous response was not valid JSON matching the required schema.',
  'Return ONLY a corrected JSON object with no extra text, no markdown fences.',
  'Escape all newlines inside JSON strings as \\n. Ensure the JSON parses cleanly.',
].join(' ')

const CLIENT_FACING_PLAN_STYLE_INSTRUCTIONS = [
  '# Client-Facing Writing Style',
  'Write every client-facing plan field in natural, coach-written plain text.',
  'Do not use Markdown formatting, asterisks, star bullets, or hyphen bullets.',
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
  '- Set nutrition_plan.calories, protein, carbs, and fat to the rounded AVERAGE daily totals from the 7-day plan (sum each day, divide by 7). NEVER use 0 or placeholder values.',
  '- Header macros MUST match the meal plan: if meals show (P: Xg | C: Yg | F: Zg | ~K kcal) lines, totals must reflect those sums.',
  '- Include a clear daily average line in the prose, e.g. "Daily averages: ~1850 kcal | P: 130g | C: 200g | F: 55g" matching the header fields.',
  '- Diet text must contain ONLY food / nutrition. Never include Cardio, Steps, Conditioning, or Supplements sections in the diet prose.',
  '- Set workout_plan.overview to "N/A" and workout_plan.days to [].',
  '- cardio_plan.sessions MUST be [].',
  '- supplement_plan.items MUST be [].',
  '- coach_notes must be an empty string or under 200 characters.',
].join('\n')

const LIBRARY_WORKOUT_OUTPUT_INSTRUCTIONS = [
  '# Plan Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no preamble.',
  'The JSON must match this exact top-level structure:',
  PLAN_JSON_SCHEMA,
  '- Put the full client-facing workout plan prose in workout_plan.overview.',
  '- workout_plan.overview must include exercises, sets, reps, and weekly structure — not internal coach analysis.',
  '- Use "sets x reps" format (e.g. 4 sets x 8 reps) — the letter x, not special symbols.',
  '- workout_plan.days may be [] when the prose already contains the daily structure.',
  '- Workout text must contain ONLY strength / resistance training. Never include a Cardio, Steps, Conditioning, or Supplements section.',
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
  if (mode === 'cardio_focus' && cardio.sessions.length === 0) {
    return { plan: null, error: 'cardio_plan.sessions must include at least one cardio session.' }
  }

  const supplements = value.supplement_plan
  if (!isRecord(supplements)) return { plan: null, error: 'Missing or invalid supplement_plan.' }
  if (!isArray(supplements.items)) return { plan: null, error: 'supplement_plan.items must be an array.' }
  if (mode === 'supplements_focus' && supplements.items.length === 0) {
    return { plan: null, error: 'supplement_plan.items must include at least one supplement recommendation.' }
  }

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
    activePlan?: Plan | null
    updatedDietPlan?: Plan | null
    libraryPrompts?: {
      actionTemplate: string
      systemTemplate: string | null
    }
    validationMode?: PlanValidationMode
    actionId?: CoachAiActionId
    promptVersion?: string
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

  const systemPrompt = [
    base.systemPrompt,
    outputInstructions,
    CLIENT_FACING_PLAN_STYLE_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join('\n\n')

  const userPrompt = [
    base.userPrompt,
    useLibraryTemplate ? null : PLAN_TASK_INSTRUCTIONS,
    options.retry ? RETRY_INSTRUCTIONS : null,
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

  const model = complexityScore.recommendedModel
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let lastValidationError = 'Unknown validation error.'
  let lastRawResponse = ''
  const maxAttempts = providerMode === 'mock' ? 1 : 2
  const validationMode = input.validationMode ?? 'full'

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
    libraryPrompts = {
      actionTemplate: loaded.action.promptBody,
      systemTemplate: loaded.system?.promptBody ?? null,
    }
    promptVersion = formatLibraryPromptVersion(loaded.action)
    if (loaded.system) {
      promptVersion = `${promptVersion}+${formatLibraryPromptVersion(loaded.system)}`
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prompts = await buildPlanPrompts(
      input.profile,
      input.latestCheckin,
      complexityScore,
      knowledgeEntries,
      input.coachInstructions,
      {
        retry: attempt === 1,
        activePlan: input.activePlan,
        updatedDietPlan: input.updatedDietPlan,
        libraryPrompts,
        validationMode,
        actionId: input.actionId,
        promptVersion,
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
        maxTokens: LIMITS.MAX_PLAN_TOKENS,
        temperature: DEFAULTS.DEFAULT_TEMPERATURE,
        mockText,
        images: input.progressImages,
      })
    } catch (err) {
      if (err instanceof ClaudeResponseError) {
        const detail = err.status ? ` (HTTP ${err.status})` : ''
        throw new GeneratePlanError(
          `Anthropic plan generation failed${detail}: ${err.message}`,
          { cause: err }
        )
      }
      throw err
    }

    totalInputTokens += response.inputTokens
    totalOutputTokens += response.outputTokens
    lastRawResponse = response.text

    const { plan, error } = parseGeneratedPlanResponse(response.text, {
      mode: validationMode,
    })
    if (plan) {
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

    lastValidationError = error ?? 'Invalid plan JSON.'
  }

  const providerLabel = providerMode === 'mock' ? 'Mock provider' : 'Anthropic'
  throw new GeneratePlanError(
    `${providerLabel} returned invalid plan JSON after retry: ${lastValidationError}. Raw response: ${lastRawResponse}`
  )
}
