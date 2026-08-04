/** Monday-first program day numbers used for client-facing Day 1…Day 7 labels. */
export const WEEKDAY_PROGRAM_DAY: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
}

const WEEKDAY_ALT = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday'

/** Display label for a day token (`day 3`, `Monday`) → `Day 3` / `Day 1`. */
export function toProgramDayLabel(dayToken: string): string {
  const normalized = dayToken.toLowerCase().replace(/\s+/g, ' ').trim()
  const dayN = normalized.match(/^day\s*(\d+)$/)
  if (dayN) return `Day ${Number(dayN[1])}`
  const n = WEEKDAY_PROGRAM_DAY[normalized]
  if (n) return `Day ${n}`
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Resolve tracker day identity from a header token.
 * Labels are always Day N. Weekday keys are kept when present so calendar "Today" matching still works.
 */
export function resolvePlanDayMeta(
  dayToken: string,
  weekdayHint?: string | null
): { key: string; label: string } {
  const token = dayToken.toLowerCase().replace(/\s+/g, ' ').trim()
  const hint = weekdayHint?.toLowerCase().trim() || null
  const dayN = token.match(/^day\s*(\d+)$/)

  const slug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

  if (dayN) {
    const n = Number(dayN[1])
    const label = `Day ${n}`
    if (hint && WEEKDAY_PROGRAM_DAY[hint]) {
      return { key: slug(hint), label }
    }
    return { key: `day-${n}`, label }
  }

  const n = WEEKDAY_PROGRAM_DAY[token]
  if (n) {
    return { key: slug(token), label: `Day ${n}` }
  }

  return { key: slug(token), label: toProgramDayLabel(token) }
}

/**
 * Rewrite day headers in diet/workout prose for client display.
 * Does not change stored plan text — display-only.
 * Examples: `Monday` → `Day 1`, `Day 2 (Wednesday) — Legs` → `Day 2 — Legs`.
 */
export function formatPlanDayHeadersForClient(text: string): string {
  if (!text.trim()) return text

  // Day N (Weekday) … → Day N …
  let out = text.replace(
    new RegExp(
      `^([\\t ]*(?:#{1,3}[\\t ]*)?(?:\\*{0,2})?)Day\\s*(\\d+)\\s*[(\\[–—:\\-]+\\s*(?:${WEEKDAY_ALT})\\s*[)\\]]?(.*)$`,
      'gim'
    ),
    (_match, prefix: string, n: string, rest: string) => `${prefix}Day ${Number(n)}${rest ?? ''}`
  )

  // Pure weekday headers (optional markdown stars / focus suffix) → Day N …
  out = out.replace(
    new RegExp(
      `^([\\t ]*(?:#{1,3}[\\t ]*)?(?:\\*{0,2})?)(${WEEKDAY_ALT})(?:\\*{0,2})?(\\s*[–—:\\-].*)?\\s*$`,
      'gim'
    ),
    (match, prefix: string, weekday: string, rest = '') => {
      const n = WEEKDAY_PROGRAM_DAY[weekday.toLowerCase()]
      if (!n) return match
      return `${prefix}Day ${n}${rest}`
    }
  )

  return out
}
