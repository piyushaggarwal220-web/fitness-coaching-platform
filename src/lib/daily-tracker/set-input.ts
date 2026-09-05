/** True while the client is still typing a number ("82.", "-", "."). */
export function isPartialNumberDraft(raw: string): boolean {
  return raw.trim() === '' || /^-?\d*\.?\d*$/.test(raw.trim())
}

export function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') return null
  if (trimmed.endsWith('.')) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function formatCommittedNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return String(value)
}
