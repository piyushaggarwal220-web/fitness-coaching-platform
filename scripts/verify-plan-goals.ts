/**
 * Verifies plan-gated goal unlock rules, including enrollment-code full unlock
 * and gender-restricted goals (women-only goals on 3 / 6 / 12 month plans).
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

const sharedUnlocked3 = getUnlockedGoals('3_months', 'male').length
const allUnlocked3 = getUnlockedGoals('3_months').length
const femaleUnlocked3 = getUnlockedGoals('3_months', 'female').length

assert('3_months unlocks shared starter goals for men', sharedUnlocked3 === 10)
assert('3_months unlocks shared + women goals without gender filter', allUnlocked3 === 13)
assert('3_months unlocks shared + women goals for women', femaleUnlocked3 === 13)
assert(
  '6_months unlocks through transformation for men',
  getUnlockedGoals('6_months', 'male').length === 15
)
assert(
  '6_months unlocks women goals for women',
  getUnlockedGoals('6_months', 'female').length === 21
)
assert('12_months unlocks full catalog', getUnlockedGoals('12_months').length === ALL_PLAN_GOAL_OPTIONS.length)
assert(
  '3_months locks higher goals for women',
  getLockedGoals('3_months', 'female').length === ALL_PLAN_GOAL_OPTIONS.length - femaleUnlocked3
)

const womenGoals3 = ['tone_and_firm', 'slim_waist', 'lifted_glutes'] as const
const womenGoals6 = ['sculpted_curves', 'lean_toned_physique', 'strong_glutes_and_legs'] as const

for (const value of womenGoals3) {
  assert(
    `${value} is 3-month women-only`,
    getGoalByValue(value)?.tier === '3_months' &&
      getGoalByValue(value)?.genders?.includes('female') === true
  )
  assert(`${value} visible for female`, isGoalVisibleForGender(value, 'female'))
  assert(`${value} hidden for male`, !isGoalVisibleForGender(value, 'male'))
}

for (const value of womenGoals6) {
  assert(
    `${value} is 6-month women-only`,
    getGoalByValue(value)?.tier === '6_months' &&
      getGoalByValue(value)?.genders?.includes('female') === true
  )
  assert(`${value} visible for female`, isGoalVisibleForGender(value, 'female'))
  assert(`${value} hidden for male`, !isGoalVisibleForGender(value, 'male'))
}

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
  'female on 3_months sees 6-month women goals locked',
  womenGoals6.every((value) => getLockedGoals('3_months', 'female').some((g) => g.value === value))
)
assert(
  'male on 3_months does not see 6-month women goals',
  womenGoals6.every((value) => !getLockedGoals('3_months', 'male').some((g) => g.value === value))
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
assert(
  'female on 3_months can select slim_waist',
  validateSelectedPlanGoals(['fat_loss', 'slim_waist'], '3_months', { gender: 'female' }) === null
)
assert(
  'male on 3_months cannot select slim_waist',
  validateSelectedPlanGoals(['fat_loss', 'slim_waist'], '3_months', { gender: 'male' }) !== null
)
assert(
  'female on 6_months can select sculpted_curves',
  validateSelectedPlanGoals(['fat_loss', 'sculpted_curves'], '6_months', { gender: 'female' }) === null
)
assert(
  'female on 3_months cannot select sculpted_curves',
  validateSelectedPlanGoals(['fat_loss', 'sculpted_curves'], '3_months', { gender: 'female' }) !== null
)

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('\nAll plan-goal assertions passed')
