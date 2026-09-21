import {
  evaluateCallBookingPolicy,
  WEEKLY_CALL_NEW_CLIENTS_FROM_ISO,
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
const newJoin = WEEKLY_CALL_NEW_CLIENTS_FROM_ISO

const threeMonth = evaluateCallBookingPolicy({
  planSlug: '3_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  joinedAt: oldJoin,
  now: day0,
})
assert('3-month cannot manual book', !threeMonth.canRequestManualCall)

const twelveBeforeDelivery = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: null,
  planDelivered: false,
  joinedAt: oldJoin,
  now: day0,
})
assert('12-month before delivery blocked', !twelveBeforeDelivery.canRequestManualCall)
assert(
  '12-month before delivery mentions plan delivery',
  Boolean(twelveBeforeDelivery.message?.includes('plan is delivered'))
)
assert('old athletic body is grandfathered', twelveBeforeDelivery.isGrandfatheredAthleticBody)

const twelveInFirstWeek = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  joinedAt: oldJoin,
  now: day0,
})
assert('12-month in first week still no manual book', !twelveInFirstWeek.canRequestManualCall)
assert('12-month in first week is wait window', twelveInFirstWeek.withinInitialTwoWeeks === true)
assert(
  '12-month in first week mentions first week',
  Boolean(twelveInFirstWeek.message?.toLowerCase().includes('first week'))
)
assert('12-month in first week has days left', (twelveInFirstWeek.daysUntilEligible ?? 0) > 0)

const twelveAfterFirstWeek = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  joinedAt: oldJoin,
  now: day7,
})
assert('old athletic body after first week can book', twelveAfterFirstWeek.canRequestManualCall)
assert('12-month after first week not in wait window', twelveAfterFirstWeek.withinInitialTwoWeeks === false)
assert('12-month after first week has no block message', twelveAfterFirstWeek.message === null)

const newTwelve = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  joinedAt: newJoin,
  now: day7,
})
assert('new athletic body clients cannot book calls', !newTwelve.canRequestManualCall)
assert('new athletic body is not grandfathered', newTwelve.isGrandfatheredAthleticBody === false)
assert('new clients see no call booking message', newTwelve.message === null)

console.log('All call-booking-policy checks passed.')
