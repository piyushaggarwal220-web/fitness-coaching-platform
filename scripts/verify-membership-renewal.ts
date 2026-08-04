import assert from 'node:assert/strict'
import {
  hasClientEntitlement,
  isInMembershipGrace,
  MEMBERSHIP_GRACE_DAYS,
  membershipReminderStage,
  needsMembershipRenewalAttention,
  subscriptionDaysRemaining,
} from '../src/lib/entitlements'
import { getCostPolicy } from '../src/lib/notifications/cost-policy'
import { getMembershipRenewalPrompt } from '../src/lib/subscription'

const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 7, 4, 12, 0, 0)

function profile(expiresOffsetDays: number) {
  return {
    payment_confirmed: true as const,
    access_source: 'purchase' as const,
    subscription_expires_at: new Date(now + expiresOffsetDays * DAY_MS).toISOString(),
  }
}

assert.equal(hasClientEntitlement(profile(10), now), true)
assert.equal(hasClientEntitlement(profile(-1), now), true, 'still entitled during grace')
assert.equal(hasClientEntitlement(profile(-MEMBERSHIP_GRACE_DAYS + 0.1), now), true)
assert.equal(hasClientEntitlement(profile(-MEMBERSHIP_GRACE_DAYS - 0.1), now), false)
assert.equal(hasClientEntitlement({ ...profile(-1), payment_confirmed: false }, now), false)

assert.equal(isInMembershipGrace(profile(-1), now), true)
assert.equal(isInMembershipGrace(profile(1), now), false)
assert.equal(needsMembershipRenewalAttention(profile(7), now), true)
assert.equal(needsMembershipRenewalAttention(profile(8), now), false)
assert.equal(needsMembershipRenewalAttention(profile(-1), now), true)

assert.equal(membershipReminderStage(profile(7).subscription_expires_at, now), 'day_7')
assert.equal(membershipReminderStage(profile(1).subscription_expires_at, now), 'day_1')
assert.equal(membershipReminderStage(profile(-0.5).subscription_expires_at, now), 'expired')
assert.equal(membershipReminderStage(profile(10).subscription_expires_at, now), null)

const prompt = getMembershipRenewalPrompt(
  profile(3),
  {
    plan_slug: '3_months',
    plan_name: '3 Months',
    created_at: new Date(now - 60 * DAY_MS).toISOString(),
    status: 'captured',
  },
  new Date(now)
)
assert.ok(prompt)
assert.equal(prompt?.tone, 'warning')
assert.match(prompt?.href ?? '', /checkout/)

const gracePrompt = getMembershipRenewalPrompt(profile(-1), null, new Date(now))
assert.ok(gracePrompt)
assert.equal(gracePrompt?.tone, 'danger')
assert.equal(gracePrompt?.inGrace, true)

const days = subscriptionDaysRemaining(profile(2.2), now)
assert.ok(days != null && days > 2 && days < 2.3)

const expiringPolicy = getCostPolicy('membership_expiring')
assert.deepEqual(expiringPolicy.immediate, ['in_app', 'web_push'])
assert.ok(expiringPolicy.escalation.includes('whatsapp'))

console.log('Membership renewal verification passed.')
