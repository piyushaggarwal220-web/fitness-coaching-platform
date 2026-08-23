import type { SleepCompletion } from './types'

/** Minutes from midnight. Accepts 22:30, 10:30 PM, 9 pm, 930pm, 9.30 am. */
export function parseClockToMinutes(raw: string | undefined | null): number | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase().replace(/\./g, ':').replace(/\s+/g, ' ')
  if (!s) return null

  const ampm = s.match(/\b(am|pm)\b/)
  const timePart = s.replace(/\b(am|pm)\b/g, '').replace(/[^0-9:]/g, '').trim()
  if (!timePart) return null

  let hours: number
  let minutes = 0

  if (timePart.includes(':')) {
    const [h, m = '0'] = timePart.split(':')
    hours = Number(h)
    minutes = Number(m.slice(0, 2))
  } else if (timePart.length <= 2) {
    hours = Number(timePart)
  } else if (timePart.length === 3) {
    hours = Number(timePart.slice(0, 1))
    minutes = Number(timePart.slice(1))
  } else {
    hours = Number(timePart.slice(0, timePart.length - 2))
    minutes = Number(timePart.slice(-2))
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (minutes < 0 || minutes > 59) return null

  if (ampm) {
    if (hours < 1 || hours > 12) return null
    if (ampm[1] === 'am') {
      if (hours === 12) hours = 0
    } else if (hours !== 12) {
      hours += 12
    }
  } else if (hours < 0 || hours > 23) {
    return null
  }

  return hours * 60 + minutes
}

/** Duration in hours. If wake is at or before bed, treat as overnight (night shift). */
export function sleepHoursFromBedAndWake(
  bedtime?: string | null,
  wakeTime?: string | null
): number | null {
  const bed = parseClockToMinutes(bedtime)
  const wake = parseClockToMinutes(wakeTime)
  if (bed == null || wake == null) return null
  let mins = wake - bed
  if (mins <= 0) mins += 24 * 60
  const hours = Math.round((mins / 60) * 2) / 2
  if (hours <= 0 || hours > 20) return null
  return hours
}

export function hasSleepLogged(sleep?: SleepCompletion | null): boolean {
  if (!sleep) return false
  if (sleep.hours != null && sleep.hours > 0) return true
  if (sleep.quality != null) return true
  if (sleep.qualityLabel) return true
  const bed = sleep.bedtime?.trim()
  const wake = sleep.wakeTime?.trim()
  return Boolean(bed && wake)
}

export function withDerivedSleepHours(sleep?: SleepCompletion): SleepCompletion | undefined {
  if (!sleep) return sleep
  const derived = sleepHoursFromBedAndWake(sleep.bedtime, sleep.wakeTime)
  if (derived == null) return sleep
  if (sleep.hours == null) return { ...sleep, hours: derived }
  return sleep
}
