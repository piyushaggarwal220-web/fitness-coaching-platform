import {
  ATHLETIC_BODY_CALL_MIN_PAISE,
  callCadenceForPlan,
  evaluateCallBookingPolicy,
  netPaidPaise,
} from '../src/lib/call-booking-policy'

function assert(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`)
  console.log(`OK: ${label}`)
}

const DAY_MS = 24 * 60 * 60 * 1000
const started = new Date('2026-01-01T00:00:00.000Z')
const day0 = new Date(started.getTime())
const day7 = new Date(started.getTime() + 7 * DAY_MS)
const paid6k = 599_900
const paid2299 = 229_900

assert('over 3k is weekly', callCadenceForPlan('12_months', 300_001) === 'weekly')
assert('exactly 3k is not weekly', callCadenceForPlan('12_months', ATHLETIC_BODY_CALL_MIN_PAISE) === 'none')
assert('2299 athletic body has no calls', callCadenceForPlan('12_months', paid2299) === 'none')
assert('6 months is biweekly', callCadenceForPlan('6_months', 99_900) === 'biweekly')
assert('3 months is none', callCadenceForPlan('3_months', paid6k) === 'none')
assert(
  'fat loss before 21 Sep 2026 has no calls',
  callCadenceForPlan('3_months', 59_900, '2026-09-20T18:29:59.000Z') === 'none'
)
assert(
  'fat loss from 21 Sep 2026 is biweekly',
  callCadenceForPlan('3_months', 59_900, '2026-09-20T18:30:00.000Z') === 'biweekly'
)
assert(
  'a future fat loss purchase is biweekly',
  callCadenceForPlan('3_months', 59_900, '2027-06-01T00:00:00.000Z') === 'biweekly'
)
assert('net paid subtracts refunds', netPaidPaise(599_900, 300_000) === 299_900)

const threeMonth = evaluateCallBookingPolicy({
  planSlug: '3_months',
  paidAmountPaise: 89_900,
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day7,
})
assert('3-month cannot book', !threeMonth.canRequestManualCall && !threeMonth.showHomeButton)

const recentFatLoss = evaluateCallBookingPolicy({
  planSlug: '3_months',
  paidAmountPaise: 59_900,
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  joinedAt: '2026-11-18T14:43:08.000Z',
  now: day7,
})
assert('recent fat loss can book after the first week', recentFatLoss.canRequestManualCall)
assert('recent fat loss is every 2 weeks', recentFatLoss.callCadence === 'biweekly' && recentFatLoss.intervalDays === 14)

const recentFatLossFirstWeek = evaluateCallBookingPolicy({
  planSlug: '3_months',
  paidAmountPaise: 59_900,
  checkinScheduleStartedAt: '2026-11-18T18:30:00.000Z',
  planDelivered: true,
  joinedAt: '2026-11-18T14:43:08.000Z',
  now: new Date('2026-11-21T07:15:00.000Z'),
})
assert('recent fat loss sees the call during the first week', recentFatLossFirstWeek.showHomeButton)
assert('recent fat loss cannot book during the first week', !recentFatLossFirstWeek.canRequestManualCall)

const cheapAthletic = evaluateCallBookingPolicy({
  planSlug: '12_months',
  paidAmountPaise: paid2299,
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day7,
})
assert('athletic body under 3k has no button', !cheapAthletic.showHomeButton && !cheapAthletic.canRequestManualCall)

const twelveBeforeDelivery = evaluateCallBookingPolicy({
  planSlug: '12_months',
  paidAmountPaise: paid6k,
  checkinScheduleStartedAt: null,
  planDelivered: false,
  now: day0,
})
assert('12-month over 3k shows button before delivery', twelveBeforeDelivery.showHomeButton)
assert('12-month before delivery cannot book yet', !twelveBeforeDelivery.canRequestManualCall)

const twelveInFirstWeek = evaluateCallBookingPolicy({
  planSlug: '12_months',
  paidAmountPaise: paid6k,
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day0,
})
assert('12-month in first week cannot book', !twelveInFirstWeek.canRequestManualCall)
assert('12-month in first week is waiting', twelveInFirstWeek.withinInitialTwoWeeks === true)

const twelveAfterFirstWeek = evaluateCallBookingPolicy({
  planSlug: '12_months',
  paidAmountPaise: paid6k,
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day7,
})
assert('athletic body over 3k can book after first week', twelveAfterFirstWeek.canRequestManualCall)
assert('athletic body cadence is weekly', twelveAfterFirstWeek.callCadence === 'weekly')

const sixAfterFirstWeek = evaluateCallBookingPolicy({
  planSlug: '6_months',
  paidAmountPaise: 149_900,
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day7,
})
assert('6-month can book after first week', sixAfterFirstWeek.canRequestManualCall)
assert('6-month cadence is biweekly', sixAfterFirstWeek.callCadence === 'biweekly' && sixAfterFirstWeek.intervalDays === 14)

console.log('All call-booking-policy checks passed.')
