const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'

const DAY = '(\\d{1,2})(?:st|nd|rd|th)?'
const MONTH_NAME = `(${MONTH})`

const RANGE = new RegExp(
  `(?:from|between)?\\s*${DAY}(?:\\s+${MONTH_NAME})?\\s*(?:to|until|till|through|and|-)\\s*${DAY}(?:\\s+${MONTH_NAME})?`,
  'i'
)

const SINGLE = new RegExp(`(?:from|starting|start(?:ing)? on|on)\\s+${DAY}\\s+${MONTH_NAME}`, 'i')

const STARTS_TODAY = /\b(from today|starting today|start today|right away|immediately|from now)\b/i

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

export type CalendarDay = { year: number; month: number; day: number }

export type DatedPlanRequest = {
  start: CalendarDay
  end: CalendarDay | null
  startsInFuture: boolean
  startLabel: string
}

function monthNumber(token: string | undefined): number | null {
  if (!token) return null
  return MONTH_INDEX[token.toLowerCase()] ?? null
}

export function istCalendarDay(now = new Date()): CalendarDay {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  return { year, month, day }
}

function compareDay(a: CalendarDay, b: CalendarDay): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

function validDay(day: number, month: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  return day <= new Date(Date.UTC(2024, month, 0)).getUTCDate()
}

function formatDay(day: CalendarDay): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day.day} ${months[day.month - 1]} ${day.year}`
}

function withThisOrNextYear(start: Omit<CalendarDay, 'year'>, end: Omit<CalendarDay, 'year'> | null, today: CalendarDay): {
  start: CalendarDay
  end: CalendarDay | null
} {
  const place = (year: number) => {
    const startDay = { year, month: start.month, day: start.day }
    if (!end) return { start: startDay, end: null }
    const endYear = end.month < start.month ? year + 1 : year
    return { start: startDay, end: { year: endYear, month: end.month, day: end.day } }
  }
  const current = place(today.year)
  const probe = current.end ?? current.start
  if (compareDay(probe, today) < 0) return place(today.year + 1)
  return current
}

/** A named future window, such as "veg from 11 to 28 Oct". Null when the change is for today. */
export function parseDatedPlanRequest(text: string, now = new Date()): DatedPlanRequest | null {
  if (STARTS_TODAY.test(text)) return null
  const today = istCalendarDay(now)

  const range = text.match(RANGE)
  if (range) {
    const startDay = Number(range[1])
    const startMonth = monthNumber(range[2])
    const endDay = Number(range[3])
    const endMonth = monthNumber(range[4]) ?? startMonth
    const month = startMonth ?? endMonth
    if (month && endMonth && validDay(startDay, month) && validDay(endDay, endMonth)) {
      const placed = withThisOrNextYear(
        { month, day: startDay },
        { month: endMonth, day: endDay },
        today
      )
      return {
        start: placed.start,
        end: placed.end,
        startsInFuture: compareDay(placed.start, today) > 0,
        startLabel: formatDay(placed.start),
      }
    }
  }

  const single = text.match(SINGLE)
  if (!single) return null
  const day = Number(single[1])
  const month = monthNumber(single[2])
  if (!month || !validDay(day, month)) return null
  const startParts = { month, day }
  const placed = withThisOrNextYear(startParts, null, today)
  return {
    start: placed.start,
    end: null,
    startsInFuture: compareDay(placed.start, today) > 0,
    startLabel: formatDay(placed.start),
  }
}

export function futurePlanChangeRefusal(text: string, now = new Date()): string | null {
  const window = parseDatedPlanRequest(text, now)
  if (!window?.startsInFuture) return null
  return `That change starts on ${window.startLabel}. Your current plan stays until then. Lock it in on that date, or say it starts today if you want it now.`
}

/** Extra instruction for the Assistant coach when the latest message names a future window. */
export function datedPlanRequestDirective(text: string, now = new Date()): string | null {
  const window = parseDatedPlanRequest(text, now)
  if (!window?.startsInFuture) return null
  return `DATE FACT: this request starts on ${window.startLabel}, which is after today in India. Do not switch today's diet or workout. Tell them the current plan stays until ${window.startLabel}. Do not tell them to lock in a plan edit today.`
}
