import {
  evaluateCallBookingPolicy,
  weeklyCallAlreadyBooked,
  weeklyCallLimitMessage,
  WEEKLY_CALL_WINDOW_MS,
} from '../src/lib/call-booking-policy'

function assert(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`)
  console.log(`OK: ${label}`)
}

const DAY_MS = 24 * 60 * 60 * 1000
const started = new Date('2026-01-01T00:00:00.000Z')
const day0 = new Date(started.getTime())
const day7 = new Date(started.getTime() + 7 * DAY_MS)
const oldJoin = started.toISOString()

const threeMonth = evaluateCallBookingPolicy({
  planSlug: '3_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  joinedAt: oldJoin,
  now: day0,
})
assert('3-month cannot manual book', !threeMonth.canRequestManualCall)
assert('3-month home hides the call button', threeMonth.weeklyCallPlan === false)

const sixBeforeDelivery = evaluateCallBookingPolicy({
  planSlug: '6_months',
  checkinScheduleStartedAt: null,
  planDelivered: false,
  now: day0,
})
assert('6-month before delivery cannot book', !sixBeforeDelivery.canRequestManualCall)
assert('6-month still sees the call plan', sixBeforeDelivery.weeklyCallPlan === true)
assert('6-month before delivery explains why', sixBeforeDelivery.message?.includes('plan is delivered') === true)

const sixDelivered = evaluateCallBookingPolicy({
  planSlug: '6_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day0,
})
assert('6-month after delivery can place a call', sixDelivered.canRequestManualCall)
assert('6-month booking has no extra wait message', sixDelivered.message === null)

const twelveBeforeDelivery = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: null,
  planDelivered: false,
  joinedAt: oldJoin,
  now: day0,
})
assert('12-month before delivery blocked', !twelveBeforeDelivery.canRequestManualCall)
assert('12-month home shows the call plan', twelveBeforeDelivery.weeklyCallPlan === true)

const twelveDelivered = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  joinedAt: oldJoin,
  now: day7,
})
assert('12-month after delivery can place a call', twelveDelivered.canRequestManualCall)
assert('12-month is not grandfathered', twelveDelivered.isGrandfatheredAthleticBody === false)
assert('window is 7 days', WEEKLY_CALL_WINDOW_MS === 7 * DAY_MS)

const now = new Date('2026-10-23T12:00:00.000Z')
const recent = new Date(now.getTime() - 2 * DAY_MS).toISOString()
const old = new Date(now.getTime() - 8 * DAY_MS).toISOString()

assert(
  'a call requested this week blocks another booking',
  weeklyCallAlreadyBooked([{ status: 'requested', requested_at: recent }], now).booked === true
)
assert(
  'an open call this week is marked open',
  weeklyCallAlreadyBooked([{ status: 'scheduled', requested_at: recent }], now).open === true
)
assert(
  'a completed call this week still blocks',
  weeklyCallAlreadyBooked([{ status: 'completed', requested_at: recent }], now).booked === true &&
    weeklyCallAlreadyBooked([{ status: 'completed', requested_at: recent }], now).open === false
)
assert(
  'a declined call this week still blocks',
  weeklyCallAlreadyBooked([{ status: 'declined', requested_at: recent }], now).booked === true
)
assert(
  'a cancelled call does not use the weekly slot',
  weeklyCallAlreadyBooked([{ status: 'cancelled', requested_at: recent }], now).booked === false
)
assert(
  'a call older than 7 days does not block',
  weeklyCallAlreadyBooked([{ status: 'completed', requested_at: old }], now).booked === false
)
assert(
  'open booking message names this week',
  weeklyCallLimitMessage(true).includes('this week')
)
assert(
  'closed booking message waits 7 days',
  weeklyCallLimitMessage(false).includes('7 days')
)

console.log('All call-booking-policy checks passed.')
