import { redactSecrets } from '@/lib/jarvis/operator-errors'

const SECRET_KEYS = /(token|secret|password|passwd|authorization|cookie|api[_-]?key|client_secret|access_token|refresh_token|credit|card|cvv|pan|ssn)/i
const PII_KEYS = /(email|phone|mobile|address|customer_name|full_name|last_name|first_name)/i
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[-.\s]?)?(?:\d{10}|\d{3}[-.\s]\d{3}[-.\s]\d{4})\b/g
const AUTH_HEADER = /authorization:\s*\S+/gi
const COOKIE_HEADER = /cookie:\s*[^\n]+/gi
const BEARER = /Bearer\s+\S+/gi

export function redactDiagnosticText(text: string): string {
  return redactSecrets(text)
    .replace(AUTH_HEADER, 'authorization: [redacted]')
    .replace(COOKIE_HEADER, 'cookie: [redacted]')
    .replace(BEARER, 'Bearer [redacted]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(CARD_PATTERN, '[redacted-payment]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
    .slice(0, 4000)
}

export function redactDiagnosticValue(value: unknown, key = ''): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    if (SECRET_KEYS.test(key)) return '[redacted]'
    if (PII_KEYS.test(key)) return '[redacted]'
    return redactDiagnosticText(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactDiagnosticValue(v, key))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) {
        out[k] = '[redacted]'
        continue
      }
      if (PII_KEYS.test(k)) {
        out[k] = '[redacted]'
        continue
      }
      out[k] = redactDiagnosticValue(v, k)
    }
    return out
  }
  return undefined
}
