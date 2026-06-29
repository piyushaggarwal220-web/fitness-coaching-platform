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
import type { Checkin, OnboardingProfile } from '@/types/database'

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
}

export type PlanValidationMode = 'full' | 'workout_focus' | 'nutrition_focus' | 'minimal'

export type GeneratePlanResult = {
  generatedPlan: GeneratedPlan
  model: string
  complexityScore: ComplexityScoreResult
  estimatedTokens: number
  inputTokens: number
  outputTokens: number
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
  'Return ONLY a corrected JSON object with no extra text.',
].join(' ')

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

/** Map onboarding profile + check-in to complexity engine input. */
export function profileToComplexityInput(
  profile: OnboardingProfile,
  latestCheckin?: Checkin | null
) {
  return {
    age: profile.age,
    gender: profile.gender,
    height: profile.height,
    weight: profile.weight,
    fitnessGoal: profile.fitness_goal,
    activityLevel: profile.activity_level,
    trainingExperience: profile.training_experience,
    dietPreference: profile.diet_preference,
    injuries: profile.injuries,
    medicalNotes: profile.medical_notes,
    sleepDuration: profile.sleep_duration,
    latestCheckin: latestCheckin
      ? {
          energy_level: latestCheckin.energy_level,
          hunger_level: latestCheckin.hunger_level,
          training_performance: latestCheckin.training_performance,
          adherence_score: latestCheckin.adherence_score,
          notes: latestCheckin.notes,
        }
      : undefined,
  }
}

/** Strip markdown code fences and extract JSON payload from model text. */
export function extractJsonFromResponse(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return trimmed
}

/** Validate parsed JSON against the required generated plan schema. */
export function validateGeneratedPlan(
  value: unknown,
  options?: { mode?: PlanValidationMode }
): { plan: GeneratedPlan | null; error: string | null } {
  const mode = options?.mode ?? 'full'
  const allowPlaceholderNutrition = mode === 'workout_focus' || mode === 'minimal'
  if (!isRecord(value)) {
    return { plan: null, error: 'Response is not a JSON object.' }
  }

  const workout = value.workout_plan
  if (!isRecord(workout)) return { plan: null, error: 'Missing or invalid workout_plan.' }
  if (!isString(workout.overview) || !workout.overview.trim()) {
    return { plan: null, error: 'workout_plan.overview must be a non-empty string.' }
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

  const cardio = value.cardio_plan
  if (!isRecord(cardio)) return { plan: null, error: 'Missing or invalid cardio_plan.' }
  if (!isArray(cardio.sessions)) return { plan: null, error: 'cardio_plan.sessions must be an array.' }

  const supplements = value.supplement_plan
  if (!isRecord(supplements)) return { plan: null, error: 'Missing or invalid supplement_plan.' }
  if (!isArray(supplements.items)) return { plan: null, error: 'supplement_plan.items must be an array.' }

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
  const jsonText = extractJsonFromResponse(text)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return { plan: null, error: 'Response is not valid JSON.' }
  }

  return validateGeneratedPlan(parsed, options)
}

function buildPlanPrompts(
  profile: OnboardingProfile,
  latestCheckin: Checkin | null | undefined,
  complexityScore: ComplexityScoreResult,
  knowledgeEntries: Awaited<ReturnType<typeof getAllKnowledge>>['data'],
  coachInstructions: string | null | undefined,
  retry = false
) {
  const base = buildPrompt({
    profile,
    latestCheckin,
    complexityScore,
    knowledgeEntries,
    coachInstructions,
  })

  const systemPrompt = `${base.systemPrompt}\n\n${PLAN_OUTPUT_INSTRUCTIONS}`
  const userPrompt = [
    base.userPrompt,
    PLAN_TASK_INSTRUCTIONS,
    retry ? RETRY_INSTRUCTIONS : null,
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

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prompts = buildPlanPrompts(
      input.profile,
      input.latestCheckin,
      complexityScore,
      knowledgeEntries,
      input.coachInstructions,
      attempt === 1
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
      mode: input.validationMode ?? 'full',
    })
    if (plan) {
      return {
        generatedPlan: plan,
        model: response.model,
        complexityScore,
        estimatedTokens: prompts.estimatedTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      }
    }

    lastValidationError = error ?? 'Invalid plan JSON.'
  }

  const providerLabel = providerMode === 'mock' ? 'Mock provider' : 'Anthropic'
  throw new GeneratePlanError(
    `${providerLabel} returned invalid plan JSON after retry: ${lastValidationError}. Raw response: ${lastRawResponse}`
  )
}
