export type DietVarietyPreference = 'same_daily' | 'fifty_fifty' | 'different_daily' | string | null | undefined

export function dietVarietyExpectsRotation(variety: DietVarietyPreference): boolean {
  return variety === 'different_daily' || variety === 'fifty_fifty'
}

function normalizeDayBody(body: string): string {
  return body
    .toLowerCase()
    .replace(/daily\s+(?:total|totals|average|averages)[^\n]*/gi, '')
    .replace(/\(p:\s*\d+g[\s\S]*?kcal\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitDietDayBodies(dietText: string): string[] {
  const re = /Day\s*(\d)\s*\(([^)]+)\)/gi
  const matches = [...dietText.matchAll(re)]
  if (matches.length === 0) return []
  const bodies: string[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i]!.index ?? 0) + matches[i]![0].length
    const end = i + 1 < matches.length ? matches[i + 1]!.index ?? dietText.length : dietText.length
    const body = normalizeDayBody(dietText.slice(start, end))
    if (body) bodies.push(body)
  }
  return bodies
}

export function scoreDietDayVariety(dietText: string): {
  days: number
  distinct: number
  cloned: boolean
} {
  const bodies = splitDietDayBodies(dietText)
  const distinct = new Set(bodies).size
  return {
    days: bodies.length,
    distinct,
    cloned: bodies.length >= 5 && distinct <= 1,
  }
}

export function collectDietProse(meals: unknown[] | undefined): string {
  if (!meals?.length) return ''
  const parts: string[] = []
  for (const meal of meals) {
    if (!meal || typeof meal !== 'object') continue
    const row = meal as Record<string, unknown>
    for (const key of ['example', 'description', 'content', 'meal'] as const) {
      const value = row[key]
      if (typeof value === 'string' && value.trim()) parts.push(value)
    }
  }
  return parts.join('\n')
}

export function dietFailsRequestedVariety(
  dietText: string,
  variety: DietVarietyPreference
): boolean {
  if (!dietVarietyExpectsRotation(variety)) return false
  const score = scoreDietDayVariety(dietText)
  if (score.days < 5) return false
  if (variety === 'different_daily') return score.distinct < 4
  return score.distinct < 3
}
