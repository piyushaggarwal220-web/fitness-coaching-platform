import { normalizePhoneForWhatsApp } from '@/lib/phone'

export const CONSULTATION_REQUEST_LIMIT = 2
export const CONSULTATION_IP_HOURLY_LIMIT = 10

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ConsultationRequestInput = {
  name: string
  email: string
  phoneE164: string
  idempotencyKey: string
}

export type ConsultationRequestValidation =
  | { ok: true; value: ConsultationRequestInput }
  | { ok: false; error: string }

export function normalizeConsultationEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function consultationQuota(used: number): { used: number; remaining: number } {
  const boundedUsed = Math.max(0, Math.min(CONSULTATION_REQUEST_LIMIT, Math.floor(used)))
  return {
    used: boundedUsed,
    remaining: CONSULTATION_REQUEST_LIMIT - boundedUsed,
  }
}

export function validateConsultationRequest(input: {
  name?: unknown
  email?: unknown
  phone?: unknown
  idempotencyKey?: unknown
}): ConsultationRequestValidation {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : ''
  const email =
    typeof input.email === 'string' ? normalizeConsultationEmail(input.email) : ''
  const phoneE164 =
    typeof input.phone === 'string' ? normalizePhoneForWhatsApp(input.phone) : null
  const idempotencyKey =
    typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : ''

  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: 'Enter your full name' }
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, error: 'Enter a valid email address' }
  }
  if (!phoneE164) {
    return { ok: false, error: 'Enter a valid WhatsApp number' }
  }
  if (!UUID_PATTERN.test(idempotencyKey)) {
    return { ok: false, error: 'Refresh the page and try again' }
  }

  return {
    ok: true,
    value: { name, email, phoneE164, idempotencyKey },
  }
}

export function isConsultationLimitError(error: {
  code?: string | null
  message?: string | null
}): boolean {
  return (
    error.code === 'P0001' &&
    error.message?.includes('CONSULTATION_REQUEST_LIMIT_REACHED') === true
  )
}
