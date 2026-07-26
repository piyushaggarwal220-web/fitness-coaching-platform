import { getCoachingDateKey } from '@/lib/checkin-schedule'

const TRACKER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type TrackerDateSelection = {
  selectedDate: string
  minDate: string
  maxDate: string
  referenceDate: Date
}

export function trackerDateReference(dateKey: string): Date | null {
  if (!TRACKER_DATE_PATTERN.test(dateKey)) return null
  const reference = new Date(`${dateKey}T12:00:00+05:30`)
  if (Number.isNaN(reference.getTime())) return null
  return getCoachingDateKey(reference) === dateKey ? reference : null
}

export function resolveTrackerDateSelection(
  requestedDate: string | null | undefined,
  scheduleStartedAt: string | Date,
  now: Date = new Date()
): { selection: TrackerDateSelection | null; error: string | null } {
  const minDate = getCoachingDateKey(new Date(scheduleStartedAt))
  const maxDate = getCoachingDateKey(now)
  const selectedDate = requestedDate?.trim() || maxDate
  const referenceDate = trackerDateReference(selectedDate)

  if (!referenceDate) {
    return { selection: null, error: 'Choose a valid tracker date.' }
  }
  if (selectedDate > maxDate) {
    return { selection: null, error: 'Future tracker dates are not available.' }
  }
  if (selectedDate < minDate) {
    return { selection: null, error: 'Choose a date on or after your first coaching day.' }
  }

  return {
    selection: {
      selectedDate,
      minDate,
      maxDate,
      referenceDate,
    },
    error: null,
  }
}

export function shiftTrackerDateKey(dateKey: string, amount: number): string {
  const reference = trackerDateReference(dateKey)
  if (!reference || !Number.isInteger(amount)) return dateKey
  const utcDate = new Date(`${dateKey}T12:00:00Z`)
  utcDate.setUTCDate(utcDate.getUTCDate() + amount)
  return utcDate.toISOString().slice(0, 10)
}

export function trackerWeekdayIndex(dateKey: string): number | null {
  if (!trackerDateReference(dateKey)) return null
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay()
}
