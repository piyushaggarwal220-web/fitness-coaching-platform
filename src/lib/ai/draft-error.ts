/** Map internal draft errors to coach-safe messages (no stack traces). */
export function sanitizeDraftFailureError(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Plan generation failed. Retry available.'

  const text = raw.trim()
  const lower = text.toLowerCase()

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Generation timed out. Retry available.'
  }
  if (
    lower.includes('provider unavailable') ||
    lower.includes('anthropic') ||
    lower.includes('overloaded') ||
    lower.includes('rate limit')
  ) {
    return 'AI provider unavailable. Retry available.'
  }
  if (lower.includes('prompt library') || lower.includes('not published')) {
    return 'AI configuration incomplete. Contact support.'
  }
  if (text.includes(' at ') || text.includes('\\') || text.includes('/src/') || text.length > 120) {
    return 'Plan generation failed. Retry available.'
  }

  return text
}
