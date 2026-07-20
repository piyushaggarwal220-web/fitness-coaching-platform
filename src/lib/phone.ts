/**
 * Normalize phone numbers for WhatsApp / AiSensy destinations.
 * Default country: India (+91). Returns null when the number is missing or invalid.
 */
export function normalizePhoneForWhatsApp(
  raw: string | null | undefined,
  defaultCountryCode = '91'
): string | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  // Already includes country code (e.g. 91XXXXXXXXXX)
  if (digits.length === 12 && digits.startsWith(defaultCountryCode)) {
    return `+${digits}`
  }

  // International with leading 00
  if (digits.startsWith('00') && digits.length >= 12) {
    return `+${digits.slice(2)}`
  }

  // 10-digit Indian mobile
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+${defaultCountryCode}${digits}`
  }

  // E.164-ish already stored without +
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`
  }

  return null
}
