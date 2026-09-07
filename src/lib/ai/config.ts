/**
 * Central AI configuration — models, defaults, and token limits.
 * Production provider is OpenAI. Override IDs via OPENAI_MODEL_* env vars.
 */

const DEFAULT_GPT_TERRA = 'gpt-5.6-terra'
const DEFAULT_GPT_LUNA = 'gpt-5.6-luna'

function readModelEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  if (!value) return fallback
  // Never honor Astra or the gpt-5.6 alias (that alias is Sol, not Terra).
  if (/astra/i.test(value) || value === 'gpt-5.6') return fallback
  return value
}

const INITIAL_PLAN_ACTIONS = new Set([
  'initial_diet',
  'initial_workout',
  'initial_cardio',
  'initial_supplements',
])

/** OpenAI model identifiers for Lurvox coaching roles. */
export const MODELS = {
  GPT_TERRA: readModelEnv('OPENAI_MODEL_TERRA', DEFAULT_GPT_TERRA),
  GPT_LUNA: readModelEnv('OPENAI_MODEL_LUNA', DEFAULT_GPT_LUNA),
}

/** Default generation settings applied when callers omit optional params. */
export const DEFAULTS = {
  DEFAULT_MODEL: readModelEnv('OPENAI_DEFAULT_MODEL', MODELS.GPT_TERRA),
  FALLBACK_MODEL: readModelEnv('OPENAI_FALLBACK_MODEL', MODELS.GPT_LUNA),
  DEFAULT_MAX_TOKENS: 1024,
  DEFAULT_TEMPERATURE: 0.7,
} as const

/** Per-feature output token ceilings for plan and check-in AI flows. */
export const LIMITS = {
  /**
   * Full diet/workout weeks (every day written out, no cross-day shortcuts) need
   * the model’s full output ceiling — lower values produced truncated / half plans.
   */
  MAX_PLAN_TOKENS: 64000,
  /** Cardio / supplements / coach notes — shorter outputs, still roomy enough to finish. */
  MAX_SUPPORT_PLAN_TOKENS: 16384,
  /**
   * Section edits must return the full revised week text (same completeness rules
   * as generation), so use the same ceiling as plan generation.
   */
  MAX_SECTION_EDIT_TOKENS: 64000,
  MAX_CHECKIN_TOKENS: 8192,
} as const

/** Slightly lower temperature for diet/workout — fewer invented mistakes. */
export const PLAN_GENERATION_TEMPERATURE = 0.4

/** Actions that are support sections (cardio / supplements). */
const SUPPORT_PLAN_ACTIONS = new Set([
  'initial_cardio',
  'initial_supplements',
  'review_update_cardio',
  'review_update_supplements',
])

export function isSupportPlanAction(actionId: string | null | undefined): boolean {
  return Boolean(actionId && SUPPORT_PLAN_ACTIONS.has(actionId))
}

export function isInitialPlanAction(actionId: string | null | undefined): boolean {
  return Boolean(actionId && INITIAL_PLAN_ACTIONS.has(actionId))
}

/**
 * Terra = create (initial plans + remakes).
 * Luna = maintain (weekly updates, minor edits, mid-week) and every other live call.
 * gpt-6-astra is never used.
 */
export function resolvePlanGenerationModel(input: {
  actionId?: string | null
  recommendedModel: string
  medicalNotes?: string | null
}): string {
  if (isInitialPlanAction(input.actionId) || !input.actionId) {
    return MODELS.GPT_TERRA
  }
  return MODELS.GPT_LUNA
}
