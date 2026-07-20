/** Normalize Auth errors so leaked-password / HIBP warnings are not shown to clients. */

const BREACH_RE =
  /data breach|have.?i.?been.?pwned|leaked password|pwned|known to be (weak|compromised)|password.*(breach|leaked|compromised)/i

export function isLeakedPasswordAuthError(message: string | null | undefined): boolean {
  if (!message) return false
  return BREACH_RE.test(message)
}

/**
 * Prefer a calm user-facing message. Returns null when the error should be ignored
 * (e.g. informational weak-password warnings that shouldn't block UX).
 */
export function sanitizeAuthPasswordError(
  message: string | null | undefined,
  opts?: { ignoreBreachWarnings?: boolean }
): string | null {
  if (!message) return null
  if (opts?.ignoreBreachWarnings !== false && isLeakedPasswordAuthError(message)) {
    return null
  }
  return message
}
