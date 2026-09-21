/**
 * Canonical business calendar for LURVOX cash/P&L metrics.
 * Timezone is always Asia/Kolkata. Do not use process-local Date#getFullYear/getDate
 * or UTC toISOString().slice(0, 10) for business-day revenue windows.
 */

export const BUSINESS_TIMEZONE = 'Asia/Kolkata'

export type CalendarRange = {
  start: Date
  endExclusive: Date
  from_ymd: string
  to_ymd: string
  timezone: string
}

type ZonedParts = { y: number; mo: number; d: number; hh: number; mm: number; ss: number }

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const map = new Map(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    y: Number(map.get('year')),
    mo: Number(map.get('month')),
    d: Number(map.get('day')),
    hh: Number(map.get('hour')),
    mm: Number(map.get('minute')),
    ss: Number(map.get('second')),
  }
}

/** Convert a civil datetime in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  timeZone: string,
  y: number,
  mo: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0
): Date {
  let t = Date.UTC(y, mo - 1, d, hh, mm, ss)
  for (let i = 0; i < 4; i++) {
    const got = zonedParts(new Date(t), timeZone)
    const gotMs = Date.UTC(got.y, got.mo - 1, got.d, got.hh, got.mm, got.ss)
    const wantMs = Date.UTC(y, mo - 1, d, hh, mm, ss)
    const delta = wantMs - gotMs
    if (delta === 0) break
    t += delta
  }
  return new Date(t)
}

export function zonedYmd(date: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  const p = zonedParts(date, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}

/** 0 = Sunday … 6 = Saturday in `timeZone`. */
export function zonedWeekdaySun0(date: Date, timeZone: string = BUSINESS_TIMEZONE): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const n = map[label]
  if (n == null) throw new Error(`Unknown weekday ${label}`)
  return n
}

function nextMidnightUtc(timeZone: string, y: number, mo: number, d: number): Date {
  const start = zonedLocalToUtc(timeZone, y, mo, d, 0, 0, 0)
  const probe = new Date(start.getTime() + 36 * 3600 * 1000)
  const nextYmd = zonedYmd(probe, timeZone)
  const [ny, nmo, nd] = nextYmd.split('-').map(Number)
  return zonedLocalToUtc(timeZone, ny, nmo, nd, 0, 0, 0)
}

/** One calendar day. `end` is inclusive last ms; `endExclusive` is next midnight. */
export function calendarDayWindow(
  timeZone: string,
  now: Date,
  dayOffset = 0
): { start: Date; end: Date; endExclusive: Date; ymd: string; timezone: string } {
  const shifted = new Date(now.getTime() + dayOffset * 86_400_000)
  const ymd = zonedYmd(shifted, timeZone)
  const [y, mo, d] = ymd.split('-').map(Number)
  const start = zonedLocalToUtc(timeZone, y, mo, d, 0, 0, 0)
  const endExclusive = nextMidnightUtc(timeZone, y, mo, d)
  return {
    start,
    end: new Date(endExclusive.getTime() - 1),
    endExclusive,
    ymd,
    timezone: timeZone,
  }
}

/** Inclusive YYYY-MM-DD range as [start, endExclusive). */
export function calendarDateRange(
  timeZone: string,
  fromYmd: string,
  toYmdInclusive: string
): CalendarRange {
  const fromParts = fromYmd.split('-').map(Number)
  const toParts = toYmdInclusive.split('-').map(Number)
  const start = zonedLocalToUtc(timeZone, fromParts[0], fromParts[1], fromParts[2], 0, 0, 0)
  const endExclusive = nextMidnightUtc(timeZone, toParts[0], toParts[1], toParts[2])
  return {
    start,
    endExclusive,
    from_ymd: fromYmd,
    to_ymd: toYmdInclusive,
    timezone: timeZone,
  }
}

/** Last N calendar days in `timeZone`, including today. */
export function lastNCalendarDays(
  timeZone: string,
  now: Date,
  n: number
): CalendarRange {
  const today = calendarDayWindow(timeZone, now, 0)
  const startDay = calendarDayWindow(timeZone, now, -(Math.max(1, n) - 1))
  return {
    start: startDay.start,
    endExclusive: today.endExclusive,
    from_ymd: startDay.ymd,
    to_ymd: today.ymd,
    timezone: timeZone,
  }
}

export function businessToday(now: Date = new Date(), timeZone = BUSINESS_TIMEZONE): CalendarRange {
  const day = calendarDayWindow(timeZone, now, 0)
  return {
    start: day.start,
    endExclusive: day.endExclusive,
    from_ymd: day.ymd,
    to_ymd: day.ymd,
    timezone: timeZone,
  }
}

export function businessYesterday(now: Date = new Date(), timeZone = BUSINESS_TIMEZONE): CalendarRange {
  const day = calendarDayWindow(timeZone, now, -1)
  return {
    start: day.start,
    endExclusive: day.endExclusive,
    from_ymd: day.ymd,
    to_ymd: day.ymd,
    timezone: timeZone,
  }
}

/** Monday 00:00 through end of today, in `timeZone`. */
export function businessWeekToDate(now: Date = new Date(), timeZone = BUSINESS_TIMEZONE): CalendarRange {
  const today = calendarDayWindow(timeZone, now, 0)
  const daysFromMonday = (zonedWeekdaySun0(now, timeZone) + 6) % 7
  const monday = calendarDayWindow(timeZone, now, -daysFromMonday)
  return {
    start: monday.start,
    endExclusive: today.endExclusive,
    from_ymd: monday.ymd,
    to_ymd: today.ymd,
    timezone: timeZone,
  }
}

/** 1st of the month 00:00 through end of today, in `timeZone`. */
export function businessMonthToDate(now: Date = new Date(), timeZone = BUSINESS_TIMEZONE): CalendarRange {
  const today = calendarDayWindow(timeZone, now, 0)
  const [y, mo] = today.ymd.split('-').map(Number)
  const start = zonedLocalToUtc(timeZone, y, mo, 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start,
    endExclusive: today.endExclusive,
    from_ymd: `${y}-${pad(mo)}-01`,
    to_ymd: today.ymd,
    timezone: timeZone,
  }
}

/** Windows Admin P&L and Jarvis revenue must share. */
export function businessRevenueWindows(now: Date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  return {
    timezone: timeZone,
    today: businessToday(now, timeZone),
    yesterday: businessYesterday(now, timeZone),
    weekToDate: businessWeekToDate(now, timeZone),
    monthToDate: businessMonthToDate(now, timeZone),
    lastN: (n: number) => lastNCalendarDays(timeZone, now, n),
    range: (fromYmd: string, toYmd: string) => calendarDateRange(timeZone, fromYmd, toYmd),
  }
}
