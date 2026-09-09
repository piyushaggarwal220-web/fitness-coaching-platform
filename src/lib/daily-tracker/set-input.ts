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

/** Unfinished but valid typing — do not save yet or the parent will wipe the field. */
export function isUnfinishedNumberDraft(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed === '') return false
  return parseOptionalNumber(trimmed) === null && isPartialNumberDraft(trimmed)
}

/** Blur / submit: keep "82." as 82 instead of clearing the set. */
export function finishNumberDraft(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') return null
  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed
  if (normalized === '' || normalized === '-') return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function formatCommittedNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  return String(value)
}
