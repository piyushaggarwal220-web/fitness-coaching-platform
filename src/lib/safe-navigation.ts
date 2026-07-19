/** Safe in-app navigation helpers — block open redirects and external phishing links. */

/** Allow only same-origin relative paths like `/dashboard` (not `//evil.com`). */
export function safeInternalPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return fallback
  if (trimmed.startsWith('//')) return fallback
  if (trimmed.includes('://')) return fallback
  if (trimmed.includes('\\')) return fallback
  return trimmed
}

/** Same as safeInternalPath, but returns null when the value is missing or unsafe. */
export function safeInternalPathOrNull(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const safe = safeInternalPath(value, '')
  return safe || null
}
