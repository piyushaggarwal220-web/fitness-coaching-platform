/**
 * Leftover upgrade price: higher plan minus the plan they already hold.
 * Run: npx tsx scripts/verify-plan-upgrade-pricing.ts
 */
import assert from 'node:assert/strict'
import { COACHING_PLANS, DIGITAL_PLANS } from '../src/lib/payments/plans'
import { expectedAmountPaiseFromOrderNotes } from '../src/lib/payments/checkout-discounts'
import {
  formatPlanUpgradeNote,
  parsePlanUpgradeNote,
  quotePlanUpgrade,
  type HeldPlanForUpgrade,
} from '../src/lib/payments/plan-upgrade-pricing'

function held(partial: {
  slug: string
  netPaidPaise: number
  startsAt: Date
  accessEndsAt: Date
  planName?: string
}): HeldPlanForUpgrade {
  return {
    planName: partial.planName ?? partial.slug,
    ...partial,
  }
}

const now = new Date('2026-11-12T12:00:00.000Z')
const recent = new Date('2026-11-12T00:00:00.000Z')
const old = new Date('2026-11-01T00:00:00.000Z')
const future = new Date('2027-02-12T00:00:00.000Z')
const past = new Date('2026-10-01T00:00:00.000Z')

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

const early = quotePlanUpgrade({
  held: [held({ slug: '3_months', netPaidPaise: 59900, startsAt: recent, accessEndsAt: future })],
  targetSlug: '6_months',
  targetListPaise: COACHING_PLANS['6_months'].amountPaise,
  now,
})
assert.equal(early.applies, true)
assert.equal(early.payablePaise, 40000)
assert.equal(early.lateFeePaise, 0)
assert.equal(early.covered, false)
pass('3 months to 6 months inside 48 hours is ₹400')

const late = quotePlanUpgrade({
  held: [held({ slug: '3_months', netPaidPaise: 59900, startsAt: old, accessEndsAt: future })],
  targetSlug: '6_months',
  targetListPaise: COACHING_PLANS['6_months'].amountPaise,
  now,
})
assert.equal(late.payablePaise, 65000)
assert.equal(late.lateFeePaise, 25000)
pass('3 months to 6 months after 48 hours is ₹400 plus ₹250')

const toYear = quotePlanUpgrade({
  held: [held({ slug: '6_months', netPaidPaise: 99900, startsAt: recent, accessEndsAt: future })],
  targetSlug: '12_months',
  targetListPaise: COACHING_PLANS['12_months'].amountPaise,
  now,
})
assert.equal(toYear.payablePaise, 70000)
pass('6 months to 12 months is ₹700')

const fromStarter = quotePlanUpgrade({
  held: [held({ slug: '3_months', netPaidPaise: 59900, startsAt: recent, accessEndsAt: future })],
  targetSlug: '12_months',
  targetListPaise: COACHING_PLANS['12_months'].amountPaise,
  now,
})
assert.equal(fromStarter.payablePaise, 110000)
pass('3 months to 12 months is ₹1,100')

const expired = quotePlanUpgrade({
  held: [held({ slug: '3_months', netPaidPaise: 59900, startsAt: old, accessEndsAt: past })],
  targetSlug: '6_months',
  targetListPaise: COACHING_PLANS['6_months'].amountPaise,
  now,
})
assert.equal(expired.applies, false)
assert.equal(expired.payablePaise, COACHING_PLANS['6_months'].amountPaise)
pass('expired plan pays the full price')

const same = quotePlanUpgrade({
  held: [held({ slug: '6_months', netPaidPaise: 99900, startsAt: recent, accessEndsAt: future })],
  targetSlug: '6_months',
  targetListPaise: COACHING_PLANS['6_months'].amountPaise,
  now,
})
assert.equal(same.applies, false)
pass('same plan is not an upgrade')

const downgrade = quotePlanUpgrade({
  held: [held({ slug: '12_months', netPaidPaise: 169900, startsAt: recent, accessEndsAt: future })],
  targetSlug: '6_months',
  targetListPaise: COACHING_PLANS['6_months'].amountPaise,
  now,
})
assert.equal(downgrade.applies, false)
pass('a shorter plan is not an upgrade')

const legacy = quotePlanUpgrade({
  held: [held({ slug: '3_months', netPaidPaise: 199900, startsAt: recent, accessEndsAt: future })],
  targetSlug: '6_months',
  targetListPaise: COACHING_PLANS['6_months'].amountPaise,
  now,
})
assert.equal(legacy.covered, true)
assert.equal(legacy.payablePaise, 0)
pass('legacy payment above the new plan price has no leftover')

const diet = quotePlanUpgrade({
  held: [held({ slug: 'digital_diet', netPaidPaise: 8900, startsAt: recent, accessEndsAt: future })],
  targetSlug: 'digital_complete',
  targetListPaise: DIGITAL_PLANS.digital_complete.amountPaise,
  now,
})
assert.equal(diet.payablePaise, 1000)
assert.equal(diet.lateFeePaise, 0)
pass('diet to complete is ₹10')

const both = quotePlanUpgrade({
  held: [
    held({ slug: 'digital_workout', netPaidPaise: 4900, startsAt: recent, accessEndsAt: future }),
    held({ slug: 'digital_diet', netPaidPaise: 8900, startsAt: recent, accessEndsAt: future }),
  ],
  targetSlug: 'digital_complete',
  targetListPaise: DIGITAL_PLANS.digital_complete.amountPaise,
  now,
})
assert.equal(both.covered, true)
pass('workout plus diet already covers complete')

const sideways = quotePlanUpgrade({
  held: [held({ slug: 'digital_workout', netPaidPaise: 4900, startsAt: recent, accessEndsAt: future })],
  targetSlug: 'digital_diet',
  targetListPaise: DIGITAL_PLANS.digital_diet.amountPaise,
  now,
})
assert.equal(sideways.applies, false)
pass('workout to diet is not an upgrade')

const cross = quotePlanUpgrade({
  held: [held({ slug: '3_months', netPaidPaise: 59900, startsAt: recent, accessEndsAt: future })],
  targetSlug: 'digital_complete',
  targetListPaise: DIGITAL_PLANS.digital_complete.amountPaise,
  now,
})
assert.equal(cross.applies, false)
pass('coaching credit does not reduce a digital plan')

assert.ok(late.payablePaise <= COACHING_PLANS['6_months'].amountPaise)
pass('upgrade charge does not exceed the target price')

const note = formatPlanUpgradeNote({
  fromSlug: '3_months',
  creditPaise: 59900,
  lateFeePaise: 0,
  anchorAt: recent.toISOString(),
})
const parsed = parsePlanUpgradeNote(note)
assert.equal(parsed?.creditPaise, 59900)
assert.equal(parsed?.fromSlug, '3_months')
pass('upgrade note round-trips')

const expected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['6_months'], {
  amount_paise: '40000',
  list_amount_paise: String(COACHING_PLANS['6_months'].amountPaise),
  plan_upgrade: note,
})
assert.equal(expected, 40000)
pass('order verification accepts the leftover amount')

const tampered = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['6_months'], {
  amount_paise: '100',
  list_amount_paise: String(COACHING_PLANS['6_months'].amountPaise),
  plan_upgrade: note,
})
assert.equal(tampered, COACHING_PLANS['6_months'].amountPaise)
pass('a leftover note that does not match the charge is rejected')

console.log('plan upgrade pricing ok')
