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
  MAX_PLAN_TOKENS: 8192,
  MAX_CHECKIN_TOKENS: 2048,
} as const
