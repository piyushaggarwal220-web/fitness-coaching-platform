import { evaluateCallBookingPolicy } from '../src/lib/call-booking-policy'

function assert(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`)
  console.log(`OK: ${label}`)
}

const started = new Date('2026-01-01T00:00:00.000Z')
const day7 = new Date(started.getTime() + 7 * 24 * 60 * 60 * 1000)
const day14 = new Date(started.getTime() + 14 * 24 * 60 * 60 * 1000)

const threeMonth = evaluateCallBookingPolicy({
  planSlug: '3_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day14,
})
assert('3-month cannot manual book', !threeMonth.canRequestManualCall)

const twelveWeek1 = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day7,
})
assert('12-month week 1 blocked', !twelveWeek1.canRequestManualCall)
assert('12-month week 1 shows days left', (twelveWeek1.daysUntilEligible ?? 0) > 0)

const twelveWeek3 = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day14,
})
assert('12-month after 2 weeks still no manual book', !twelveWeek3.canRequestManualCall)
assert('12-month after 2 weeks auto message', Boolean(twelveWeek3.message?.includes('automatically')))

console.log('All call-booking-policy checks passed.')
