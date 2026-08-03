/**
 * Verifies plan-gated goal unlock rules, including enrollment-code full unlock
 * and gender-restricted goals (Hourglass Physique for women on 12 months).
 */
import {
  ALL_PLAN_GOAL_OPTIONS,
  getGoalByValue,
  getLockedGoals,
  getUnlockedGoals,
  isGoalVisibleForGender,
  resolveGoalPlanTier,
  validateSelectedPlanGoals,
} from '../src/lib/plan-goals'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

assert('3_months unlocks starter tier only', getUnlockedGoals('3_months').length === 10)
assert('6_months unlocks through transformation', getUnlockedGoals('6_months').length === 15)
assert('12_months unlocks full catalog', getUnlockedGoals('12_months').length === ALL_PLAN_GOAL_OPTIONS.length)
assert('3_months locks higher goals', getLockedGoals('3_months').length === ALL_PLAN_GOAL_OPTIONS.length - 10)

assert(
  'hourglass is a 12-month women-only goal',
  getGoalByValue('hourglass_physique')?.tier === '12_months' &&
    getGoalByValue('hourglass_physique')?.genders?.includes('female') === true
)
assert('hourglass visible for female', isGoalVisibleForGender('hourglass_physique', 'female'))
assert('hourglass hidden for male', !isGoalVisibleForGender('hourglass_physique', 'male'))
assert(
  'female on 12_months can unlock hourglass',
  getUnlockedGoals('12_months', 'female').some((g) => g.value === 'hourglass_physique')
)
assert(
  'male on 12_months cannot unlock hourglass',
  !getUnlockedGoals('12_months', 'male').some((g) => g.value === 'hourglass_physique')
)
assert(
  'female on 3_months sees hourglass locked',
  getLockedGoals('3_months', 'female').some((g) => g.value === 'hourglass_physique')
)
assert(
  'male on 3_months does not see hourglass locked',
  !getLockedGoals('3_months', 'male').some((g) => g.value === 'hourglass_physique')
)

assert(
  'paid 6_months resolves to 6_months',
  resolveGoalPlanTier('6_months', { accessSource: 'purchase' }) === '6_months'
)
assert(
  'admin_trial unlocks full catalog',
  resolveGoalPlanTier(undefined, { accessSource: 'admin_trial' }) === '12_months'
)
assert(
  'enrollment_code unlocks full catalog without purchase slug',
  resolveGoalPlanTier(undefined, { accessSource: 'enrollment_code' }) === '12_months'
)
assert(
  'enrollment_code unlocks full catalog even when code plan is 6_months',
  resolveGoalPlanTier('6_months', { accessSource: 'enrollment_code' }) === '12_months'
)
assert(
  'enrollment_code unlocks full catalog even when code plan is 3_months',
  resolveGoalPlanTier('3_months', { accessSource: 'enrollment_code' }) === '12_months'
)
assert(
  'unknown access defaults to 3_months',
  resolveGoalPlanTier(undefined, { accessSource: null }) === '3_months'
)
assert('legacy 1_month maps to 3_months', resolveGoalPlanTier('1_month') === '3_months')

const enrollmentTier = resolveGoalPlanTier(undefined, { accessSource: 'enrollment_code' })
assert(
  'enrollment can select a 12-month goal',
  validateSelectedPlanGoals(['fat_loss', 'complete_body_transformation'], enrollmentTier) === null
)
assert(
  '3_months cannot select a 12-month goal',
  validateSelectedPlanGoals(['fat_loss', 'complete_body_transformation'], '3_months') !== null
)
assert(
  'female on 12_months can select hourglass',
  validateSelectedPlanGoals(['fat_loss', 'hourglass_physique'], '12_months', { gender: 'female' }) === null
)
assert(
  'male on 12_months cannot select hourglass',
  validateSelectedPlanGoals(['fat_loss', 'hourglass_physique'], '12_months', { gender: 'male' }) !== null
)

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('\nAll plan-goal assertions passed')
