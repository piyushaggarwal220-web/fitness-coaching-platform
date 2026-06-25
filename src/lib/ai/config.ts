/**
 * Central AI configuration — single source of truth for models, defaults, and token limits.
 * To add GPT or Gemini later, extend MODELS and DEFAULTS here; provider modules read from this file.
 */

/** Anthropic Claude model identifiers. Add OPENAI / GEMINI sibling keys when those providers ship. */
export const MODELS = {
  CLAUDE_HAIKU: 'claude-haiku-4-5-20251001',
  CLAUDE_SONNET: 'claude-sonnet-4-20250514',
} as const

/** Default generation settings applied when callers omit optional params. */
export const DEFAULTS = {
  DEFAULT_MODEL: MODELS.CLAUDE_SONNET,
  DEFAULT_MAX_TOKENS: 1024,
  DEFAULT_TEMPERATURE: 0.7,
} as const

/** Per-feature output token ceilings for plan and check-in AI flows. */
export const LIMITS = {
  MAX_PLAN_TOKENS: 4096,
  MAX_CHECKIN_TOKENS: 2048,
} as const
