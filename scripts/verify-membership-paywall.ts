import assert from 'node:assert/strict'
import {
  assertClientCanReceivePlanChanges,
  getClientPaymentGatePath,
  hasClientEntitlement,
  MEMBERSHIP_GRACE_DAYS,
  MIN_DAYS_REQUIRED_FOR_PLAN_CHANGE,
} from '../src/lib/entitlements'

assert.equal(MIN_DAYS_REQUIRED_FOR_PLAN_CHANGE, 1)

const now = Date.UTC(2026, 7, 4, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000

function profile(daysLeft: number) {
  return {
    payment_confirmed: true as const,
    access_source: 'purchase' as const,
    subscription_expires_at: new Date(now + daysLeft * DAY_MS).toISOString(),
  }
}

assert.equal(assertClientCanReceivePlanChanges(profile(5), now).ok, true)
assert.equal(assertClientCanReceivePlanChanges(profile(1), now).ok, true)
assert.equal(assertClientCanReceivePlanChanges(profile(0.5), now).ok, true)
assert.equal(assertClientCanReceivePlanChanges(profile(0), now).ok, false)
assert.equal(assertClientCanReceivePlanChanges(profile(-0.1), now).ok, false)

// Still entitled during the 3-day grace window after expiry.
assert.equal(
  hasClientEntitlement({
    payment_confirmed: true,
    access_source: 'purchase',
    subscription_expires_at: new Date(Date.now() - 60_000).toISOString(),
  }),
  true
)
// Hard paywall only after grace ends.
assert.equal(
  hasClientEntitlement({
    payment_confirmed: true,
    access_source: 'purchase',
    subscription_expires_at: new Date(
      Date.now() - (MEMBERSHIP_GRACE_DAYS * DAY_MS + 60_000)
    ).toISOString(),
  }),
  false
)
assert.equal(
  hasClientEntitlement({
    payment_confirmed: true,
    access_source: 'purchase',
    subscription_expires_at: new Date(Date.now() + 3 * DAY_MS).toISOString(),
  }),
  true
)

assert.equal(
  getClientPaymentGatePath({
    access_source: 'purchase',
    subscription_expires_at: profile(-1).subscription_expires_at,
  }),
  '/membership-required'
)
assert.equal(
  getClientPaymentGatePath({
    access_source: null,
    subscription_expires_at: null,
  }),
  '/checkout?plan=6_months'
)
assert.equal(
  getClientPaymentGatePath({
    access_source: 'enrollment_code',
    subscription_expires_at: profile(-1).subscription_expires_at,
  }),
  '/membership-required'
)

const blocked = assertClientCanReceivePlanChanges(profile(0), now)
assert.equal(blocked.ok, false)
if (!blocked.ok) {
  assert.match(blocked.error, /subscription has ended/i)
}

console.log('Membership paywall + final-day plan window verification passed.')
