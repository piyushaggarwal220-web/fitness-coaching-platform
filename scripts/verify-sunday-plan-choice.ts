/**
 * 84-day clients get a new plan on the Sunday check-in only when they ask for one.
 * Run: npx tsx scripts/verify-sunday-plan-choice.ts
 */
import assert from 'node:assert/strict'
import {
  offersSundayPlanChoice,
  shouldGenerateChosenWeeklyPlan,
} from '../src/lib/plan-update-cadence'

assert.equal(offersSundayPlanChoice('offer_84_days'), true)
assert.equal(offersSundayPlanChoice('3_months'), false)
assert.equal(offersSundayPlanChoice('6_months'), false)

assert.equal(
  shouldGenerateChosenWeeklyPlan({
    planSlug: 'offer_84_days',
    coachingWeek: 3,
    wantsPlanUpdate: true,
  }),
  true
)
assert.equal(
  shouldGenerateChosenWeeklyPlan({
    planSlug: 'offer_84_days',
    coachingWeek: 3,
    wantsPlanUpdate: false,
  }),
  false
)
assert.equal(
  shouldGenerateChosenWeeklyPlan({
    planSlug: 'offer_84_days',
    coachingWeek: 3,
    wantsPlanUpdate: null,
  }),
  true
)
assert.equal(
  shouldGenerateChosenWeeklyPlan({
    planSlug: '6_months',
    coachingWeek: 3,
    wantsPlanUpdate: false,
  }),
  true
)
assert.equal(
  shouldGenerateChosenWeeklyPlan({
    planSlug: '3_months',
    coachingWeek: 3,
    wantsPlanUpdate: true,
  }),
  false
)

console.log('✓ 84-day Sunday check-in chooses whether the plan updates')
