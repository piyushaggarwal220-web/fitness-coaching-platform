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

const WEEKDAY_BY_PROGRAM_DAY: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}

const WEEKDAY_ALT = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday'

function titleCaseWeekday(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function weekdayNameForProgramDay(dayN: number): string | null {
  return WEEKDAY_BY_PROGRAM_DAY[dayN] ?? null
}

/** `Day 1 (Monday)` … `Day 7 (Sunday)`. */
export function formatProgramDayLabel(dayN: number, weekdayHint?: string | null): string {
  const hint = weekdayHint?.trim()
  if (hint) {
    const named = WEEKDAY_PROGRAM_DAY[hint.toLowerCase()]
    if (named) return `Day ${dayN} (${titleCaseWeekday(hint)})`
  }
  const weekday = weekdayNameForProgramDay(dayN)
  return weekday ? `Day ${dayN} (${weekday})` : `Day ${dayN}`
}

/** Display label for a day token (`day 3`, `Monday`) → `Day 3 (Wednesday)` / `Day 1 (Monday)`. */
export function toProgramDayLabel(dayToken: string): string {
  const normalized = dayToken.toLowerCase().replace(/\s+/g, ' ').trim()
  const dayN = normalized.match(/^day\s*(\d+)$/)
  if (dayN) return formatProgramDayLabel(Number(dayN[1]))
  const n = WEEKDAY_PROGRAM_DAY[normalized]
  if (n) return formatProgramDayLabel(n)
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase())
}

export type PlanDayMeta = {
  key: string
  label: string
  /** True when the plan header named a weekday (Monday / Day 2 (Wednesday)), not inferred from Day N. */
  calendarAligned: boolean
}

/**
 * Resolve tracker day identity from a header token.
 * Labels always include the weekday so diet/workout pickers read "Day 1 (Monday)".
 */
export function resolvePlanDayMeta(
  dayToken: string,
  weekdayHint?: string | null
): PlanDayMeta {
  const token = dayToken.toLowerCase().replace(/\s+/g, ' ').trim()
  const hint = weekdayHint?.toLowerCase().trim() || null
  const dayN = token.match(/^day\s*(\d+)$/)

  const slug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

  if (dayN) {
    const n = Number(dayN[1])
    const label = formatProgramDayLabel(n, hint)
    if (hint && WEEKDAY_PROGRAM_DAY[hint]) {
      return { key: slug(hint), label, calendarAligned: true }
    }
    return { key: `day-${n}`, label, calendarAligned: false }
  }

  const n = WEEKDAY_PROGRAM_DAY[token]
  if (n) {
    return { key: slug(token), label: formatProgramDayLabel(n), calendarAligned: true }
  }

  return { key: slug(token), label: toProgramDayLabel(token), calendarAligned: false }
}

/**
 * Rewrite day headers in diet/workout/cardio prose for client display.
 * Does not change stored plan text — display-only.
 * Examples: `Monday` → `Day 1 (Monday)`, `Day 2` → `Day 2 (Tuesday)`.
 */
export function formatPlanDayHeadersForClient(text: string): string {
  if (!text.trim()) return text

  const prefix = `^([\\t ]*(?:#{1,3}[\\t ]*)?(?:\\*{0,2})?)`

  // Day N (Weekday) … → keep weekday, normalize spacing
  let out = text.replace(
    new RegExp(
      `${prefix}Day\\s*(\\d+)\\s*[(\\[–—:\\-]+\\s*(${WEEKDAY_ALT})\\s*[)\\]]?(.*)$`,
      'gim'
    ),
    (_match, pfx: string, n: string, weekday: string, rest: string) =>
      `${pfx}Day ${Number(n)} (${titleCaseWeekday(weekday)})${rest ?? ''}`
  )

  // Pure weekday headers → Day N (Weekday)
  out = out.replace(
    new RegExp(
      `${prefix}(${WEEKDAY_ALT})(?:\\*{0,2})?(\\s*[–—:\\-].*)?\\s*$`,
      'gim'
    ),
    (match, pfx: string, weekday: string, rest = '') => {
      const n = WEEKDAY_PROGRAM_DAY[weekday.toLowerCase()]
      if (!n) return match
      return `${pfx}Day ${n} (${weekday})${rest}`
    }
  )

  // Bare Day N (no weekday yet) → Day N (Weekday) using Monday = Day 1
  out = out.replace(
    new RegExp(`${prefix}Day\\s*(\\d+)(?!\\s*\\()(.*)$`, 'gim'),
    (match, pfx: string, n: string, rest: string) => {
      const dayN = Number(n)
      const weekday = weekdayNameForProgramDay(dayN)
      if (!weekday) return match
      return `${pfx}Day ${dayN} (${weekday})${rest ?? ''}`
    }
  )

  return out
}
