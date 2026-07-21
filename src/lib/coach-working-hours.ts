export const COACH_WORK_START_HOUR = 9
export const COACH_WORK_END_HOUR = 18
export const COACH_RESPONSE_TARGET_MS = 2 * 60 * 60 * 1000

const INDIA_TIME_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

export type CoachWorkingHoursStatus = {
  isOpen: boolean
  opensAt: Date
  closesAt: Date
  nextOpensAt: Date
}

function indiaCalendarParts(referenceDate: Date) {
  const indiaTime = new Date(referenceDate.getTime() + INDIA_TIME_OFFSET_MS)
  return {
    year: indiaTime.getUTCFullYear(),
    month: indiaTime.getUTCMonth(),
    day: indiaTime.getUTCDate(),
  }
}

function indiaLocalTime(
  parts: { year: number; month: number; day: number },
  hour: number
): Date {
  return new Date(
    Date.UTC(parts.year, parts.month, parts.day, hour) - INDIA_TIME_OFFSET_MS
  )
}

export function getCoachWorkingHoursStatus(
  referenceDate: Date = new Date()
): CoachWorkingHoursStatus {
  const parts = indiaCalendarParts(referenceDate)
  const opensAt = indiaLocalTime(parts, COACH_WORK_START_HOUR)
  const closesAt = indiaLocalTime(parts, COACH_WORK_END_HOUR)
  const isOpen =
    referenceDate.getTime() >= opensAt.getTime() &&
    referenceDate.getTime() < closesAt.getTime()
  const nextOpensAt = referenceDate.getTime() < opensAt.getTime()
    ? opensAt
    : indiaLocalTime({ ...parts, day: parts.day + 1 }, COACH_WORK_START_HOUR)

  return { isOpen, opensAt, closesAt, nextOpensAt }
}

export function addCoachWorkingTime(
  startedAt: string | number | Date,
  durationMs: number = COACH_RESPONSE_TARGET_MS
): Date {
  let cursor = new Date(startedAt)
  if (Number.isNaN(cursor.getTime())) throw new Error('Invalid response target start')

  let remainingMs = Math.max(0, durationMs)
  while (remainingMs > 0) {
    const hours = getCoachWorkingHoursStatus(cursor)
    if (!hours.isOpen) {
      cursor = hours.nextOpensAt
      continue
    }

    const availableMs = hours.closesAt.getTime() - cursor.getTime()
    if (remainingMs <= availableMs) {
      return new Date(cursor.getTime() + remainingMs)
    }

    remainingMs -= availableMs
    cursor = getCoachWorkingHoursStatus(hours.closesAt).nextOpensAt
  }

  return cursor
}

export function formatNextCoachWorkingHours(referenceDate: Date): string {
  const nextOpen = getCoachWorkingHoursStatus(referenceDate).nextOpensAt
  const referenceParts = indiaCalendarParts(referenceDate)
  const nextParts = indiaCalendarParts(nextOpen)
  const dayDifference = Math.round(
    (
      Date.UTC(nextParts.year, nextParts.month, nextParts.day) -
      Date.UTC(referenceParts.year, referenceParts.month, referenceParts.day)
    ) / (24 * 60 * 60 * 1000)
  )
  const dayLabel = dayDifference === 0 ? 'today' : dayDifference === 1 ? 'tomorrow' : nextOpen.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  })
  return `${dayLabel} at 9:00 AM`
}
