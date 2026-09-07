/**
 * Central AI configuration — models, defaults, and token limits.
 * Production provider is OpenAI. Override IDs via OPENAI_MODEL_* env vars.
 */

const DEFAULT_GPT_TERRA = 'gpt-5.6-terra'
const DEFAULT_GPT_LUNA = 'gpt-5.6-luna'
const DEFAULT_GPT_ASTRA = 'gpt-6-astra'

function readModelEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value || fallback
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
  GPT_ASTRA: readModelEnv('OPENAI_MODEL_ASTRA', DEFAULT_GPT_ASTRA),
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

function hasHighRiskMedical(medicalNotes: string | null | undefined): boolean {
  const text = medicalNotes?.trim()
  if (!text) return false
  return !/^(none|n\/a|na|no|nil|-)$/i.test(text)
}

/**
 * Terra = create (initial plans + remakes).
 * Luna = maintain (weekly updates, minor edits, mid-week) and all auto HIGH-complexity work.
 * Astra is never auto-selected: it is billed at ~$10 / $40 per 1M tokens with high
 * reasoning, and a single timed-out weekly diet+workout pass can cost several dollars.
 * Set OPENAI_ALLOW_ASTRA=1 only for an explicit stuck/complex coach job.
 */
export function resolvePlanGenerationModel(input: {
  actionId?: string | null
  recommendedModel: string
  medicalNotes?: string | null
}): string {
  if (isInitialPlanAction(input.actionId) || !input.actionId) {
    return MODELS.GPT_TERRA
  }
  if (hasHighRiskMedical(input.medicalNotes)) {
    return MODELS.GPT_LUNA
  }
  if (isSupportPlanAction(input.actionId) || input.actionId.startsWith('review_update_')) {
    return MODELS.GPT_LUNA
  }
  if (input.recommendedModel.includes('astra') && process.env.OPENAI_ALLOW_ASTRA?.trim() !== '1') {
    return MODELS.GPT_LUNA
  }
  return input.recommendedModel
}
