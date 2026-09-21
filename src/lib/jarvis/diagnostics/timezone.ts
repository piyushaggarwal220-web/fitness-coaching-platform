export {
  BUSINESS_TIMEZONE,
  calendarDayWindow,
  calendarDateRange,
  lastNCalendarDays,
  zonedLocalToUtc,
  zonedYmd,
} from '@/lib/time/business-calendar'

export function utcMidnightWindow(now: Date): { start: Date; end: Date } {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  end.setUTCMilliseconds(-1)
  return { start, end }
}

export function timezoneMismatchRisk(input: {
  shopTimezone: string | null
  pipelineTimezone: string
}): { mismatch: boolean; detail: string } {
  const shop = input.shopTimezone || 'unknown'
  if (shop === 'unknown') {
    return { mismatch: false, detail: 'Shop timezone unknown.' }
  }
  if (shop === input.pipelineTimezone) {
    return { mismatch: false, detail: `Pipeline timezone matches shop (${shop}).` }
  }
  return {
    mismatch: true,
    detail: `Pipeline uses ${input.pipelineTimezone} while the shop timezone is ${shop}. Calendar-day metrics can hide or shift sales.`,
  }
}
