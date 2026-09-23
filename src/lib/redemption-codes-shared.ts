/**
 * Client-safe redemption helpers (no server-only / DB imports).
 */
export function normalizeRedemptionCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}
