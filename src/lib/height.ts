export const MIN_HEIGHT_CM = 120
export const MAX_HEIGHT_CM = 230

export type FeetInches = {
  feet: number
  inches: number
}

export function roundHeightCm(value: number): number {
  return Math.round(value)
}

export function normalizeFeetInches(feet: number, inches: number): FeetInches {
  const totalInches = Math.max(0, Math.round(feet * 12 + inches))
  return {
    feet: Math.floor(totalInches / 12),
    inches: totalInches % 12,
  }
}

export function cmToFeetInches(cm: number): FeetInches {
  if (!Number.isFinite(cm) || cm <= 0) return { feet: 0, inches: 0 }
  const totalInches = Math.round(cm / 2.54)
  return {
    feet: Math.floor(totalInches / 12),
    inches: totalInches % 12,
  }
}

export function feetInchesToCm(feet: number, inches: number): number {
  const normalized = normalizeFeetInches(feet, inches)
  return roundHeightCm((normalized.feet * 12 + normalized.inches) * 2.54)
}

export function parseHeightCm(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? roundHeightCm(parsed) : null
}

export function validateHeightCm(value: string | number | null | undefined): string | null {
  const heightCm = parseHeightCm(value)
  if (heightCm == null) return 'Enter your height.'
  if (heightCm < MIN_HEIGHT_CM || heightCm > MAX_HEIGHT_CM) {
    return `Height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`
  }
  return null
}

export function formatHeight(cm: string | number | null | undefined): string {
  const heightCm = parseHeightCm(cm)
  if (heightCm == null) return '—'
  const { feet, inches } = cmToFeetInches(heightCm)
  return `${heightCm} cm (${feet} ft ${inches} in)`
}
