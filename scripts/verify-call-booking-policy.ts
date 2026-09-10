import { evaluateCallBookingPolicy } from '../src/lib/call-booking-policy'

function assert(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`)
  console.log(`OK: ${label}`)
}

const started = new Date('2026-01-01T00:00:00.000Z')
const day0 = new Date(started.getTime())

const threeMonth = evaluateCallBookingPolicy({
  planSlug: '3_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day0,
})
assert('3-month cannot manual book', !threeMonth.canRequestManualCall)

const twelveBeforeDelivery = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: null,
  planDelivered: false,
  now: day0,
})
assert('12-month before delivery blocked', !twelveBeforeDelivery.canRequestManualCall)
assert(
  '12-month before delivery mentions plan delivery',
  Boolean(twelveBeforeDelivery.message?.includes('plan is delivered'))
)

const twelveOnDelivery = evaluateCallBookingPolicy({
  planSlug: '12_months',
  checkinScheduleStartedAt: started.toISOString(),
  planDelivered: true,
  now: day0,
})
assert('12-month on delivery still no manual book', !twelveOnDelivery.canRequestManualCall)
assert('12-month on delivery auto message', Boolean(twelveOnDelivery.message?.includes('automatically')))
assert('12-month on delivery shows coach queue', Boolean(twelveOnDelivery.message?.includes('work queue')))
assert('12-month on delivery not in wait window', twelveOnDelivery.withinInitialTwoWeeks === false)

console.log('All call-booking-policy checks passed.')
