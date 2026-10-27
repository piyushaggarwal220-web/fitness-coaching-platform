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
assert('net paid subtracts refunds', netPaidPaise(599_900, 300_000) === 299_900)

const threeMonth = evaluateCallBookingPolicy({
  planSlug: '3_months',
  paidAmountPaise: 89_900,
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day7,
})
assert('3-month cannot book', !threeMonth.canRequestManualCall && !threeMonth.showHomeButton)

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
