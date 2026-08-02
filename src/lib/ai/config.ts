/**
 * Central AI configuration — single source of truth for models, defaults, and token limits.
 * To add GPT or Gemini later, extend MODELS and DEFAULTS here; provider modules read from this file.
 */

/** Pinned snapshot defaults — see https://platform.claude.com/docs/en/about-claude/models/overview */
const DEFAULT_CLAUDE_HAIKU = 'claude-haiku-4-5-20251001'
const DEFAULT_CLAUDE_SONNET = 'claude-sonnet-4-5-20250929'

function readModelEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value || fallback
}

/** Anthropic Claude model identifiers. Override via ANTHROPIC_MODEL_HAIKU / ANTHROPIC_MODEL_SONNET. */
export const MODELS = {
  CLAUDE_HAIKU: readModelEnv('ANTHROPIC_MODEL_HAIKU', DEFAULT_CLAUDE_HAIKU),
  CLAUDE_SONNET: readModelEnv('ANTHROPIC_MODEL_SONNET', DEFAULT_CLAUDE_SONNET),
}

/** Default generation settings applied when callers omit optional params. */
export const DEFAULTS = {
  DEFAULT_MODEL: readModelEnv('ANTHROPIC_DEFAULT_MODEL', MODELS.CLAUDE_SONNET),
  FALLBACK_MODEL: readModelEnv('ANTHROPIC_FALLBACK_MODEL', MODELS.CLAUDE_HAIKU),
  DEFAULT_MAX_TOKENS: 1024,
  DEFAULT_TEMPERATURE: 0.7,
} as const

/** Per-feature output token ceilings for plan and check-in AI flows. */
export const LIMITS = {
  /**
   * Full diet/workout weeks (every day written out, no cross-day shortcuts) need
   * the model’s full output ceiling — lower values produced truncated / half plans.
   * Claude Sonnet max output is 64k; prefer completeness over token savings.
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

/** Actions that are safe on Haiku (lower stakes than diet/workout). */
const HAIKU_PLAN_ACTIONS = new Set([
  'initial_cardio',
  'initial_supplements',
  'review_update_cardio',
  'review_update_supplements',
])

export function isSupportPlanAction(actionId: string | null | undefined): boolean {
  return Boolean(actionId && HAIKU_PLAN_ACTIONS.has(actionId))
}

/**
 * Prefer Haiku for cardio/supplements; keep complexity routing for diet/workout.
 * Diet + workout quality stays on Sonnet when complexity is MEDIUM/HIGH.
 */
export function resolvePlanGenerationModel(input: {
  actionId?: string | null
  recommendedModel: string
}): string {
  if (isSupportPlanAction(input.actionId)) {
    return MODELS.CLAUDE_HAIKU
  }
  return input.recommendedModel
}
