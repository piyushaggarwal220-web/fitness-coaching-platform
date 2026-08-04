/**
 * Verifies body-type goal paths, plan unlocks, gender filters, and upgrade hints.
 */
import {
  ALL_PLAN_GOAL_OPTIONS,
  GOAL_BODY_TYPE_ORDER,
  getGoalByValue,
  getGoalsForBodyType,
  getLockedGoals,
  getUnlockedGoals,
  isGoalVisibleForGender,
  resolveGoalPlanTier,
  suggestedUpgradeTier,
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

assert('catalog has three body paths', GOAL_BODY_TYPE_ORDER.length === 3)
assert('catalog has many selectable goals', ALL_PLAN_GOAL_OPTIONS.length >= 40)

for (const bodyType of GOAL_BODY_TYPE_ORDER) {
  const bodyGoals = getGoalsForBodyType(bodyType, { section: 'body' })
  assert(`${bodyType} has 3-month goals`, bodyGoals.some((g) => g.tier === '3_months'))
  assert(`${bodyType} has 6-month goals`, bodyGoals.some((g) => g.tier === '6_months'))
  assert(`${bodyType} has 12-month goals`, bodyGoals.some((g) => g.tier === '12_months'))
}

assert(
  'weight_gain 3m includes healthy_weight_gain',
  getGoalsForBodyType('weight_gain', { section: 'body' }).some((g) => g.value === 'healthy_weight_gain')
)
assert(
  'skinny_fat 3m includes lose_fat_build_muscle',
  getGoalsForBodyType('skinny_fat', { section: 'body' }).some((g) => g.value === 'lose_fat_build_muscle')
)
assert(
  'lose_fat_fast 3m includes drop_belly_fat_fast',
  getGoalsForBodyType('lose_fat_fast', { section: 'body' }).some((g) => g.value === 'drop_belly_fat_fast')
)

assert(
  'female physique includes hourglass',
  getGoalsForBodyType('skinny_fat', { gender: 'female', section: 'physique' }).some(
    (g) => g.value === 'hourglass_physique'
  )
)
assert(
  'male physique includes classic_v_taper',
  getGoalsForBodyType('weight_gain', { gender: 'male', section: 'physique' }).some(
    (g) => g.value === 'classic_v_taper'
  )
)
assert(
  'male does not see hourglass',
  !isGoalVisibleForGender('hourglass_physique', 'male')
)
assert(
  'female does not see classic_v_taper',
  !isGoalVisibleForGender('classic_v_taper', 'female')
)

assert(
  '3_months unlocks only 3m goals for men on weight_gain',
  getUnlockedGoals('3_months', 'male', 'weight_gain').every((g) => g.tier === '3_months')
)
assert(
  '3_months locks 12m size goal for weight_gain women',
  getLockedGoals('3_months', 'female', 'weight_gain').some((g) => g.value === 'complete_size_transformation')
)

assert(
  'female on 3_months is suggested 6_months upgrade when locked goals exist',
  suggestedUpgradeTier('3_months', { gender: 'female', bodyType: 'skinny_fat' }) === '6_months'
)
assert(
  '12_months has no upgrade suggestion',
  suggestedUpgradeTier('12_months', { gender: 'female', bodyType: 'lose_fat_fast' }) === null
)

assert(
  'paid 6_months resolves to 6_months',
  resolveGoalPlanTier('6_months', { accessSource: 'purchase' }) === '6_months'
)
assert(
  'enrollment_code unlocks full catalog',
  resolveGoalPlanTier('3_months', { accessSource: 'enrollment_code' }) === '12_months'
)

assert(
  'requires body type when asked',
  validateSelectedPlanGoals(['fat_loss', 'debloat_body'], '3_months', {
    gender: 'female',
    requireBodyType: true,
  }) !== null
)
assert(
  'female lose_fat_fast on 3_months can select fat goals',
  validateSelectedPlanGoals(['fat_loss', 'drop_belly_fat_fast'], '3_months', {
    gender: 'female',
    bodyType: 'lose_fat_fast',
    requireBodyType: true,
  }) === null
)
assert(
  'cannot mix weight_gain goal into lose_fat_fast path',
  validateSelectedPlanGoals(['fat_loss', 'healthy_weight_gain'], '3_months', {
    gender: 'male',
    bodyType: 'lose_fat_fast',
    requireBodyType: true,
  }) !== null
)
assert(
  'locked 12m goal rejected on 3_months',
  validateSelectedPlanGoals(['fat_loss', 'complete_fat_loss_transformation'], '3_months', {
    gender: 'female',
    bodyType: 'lose_fat_fast',
  }) !== null
)
assert(
  'female can add physique goal with body goals',
  validateSelectedPlanGoals(['lose_fat_build_muscle', 'slim_waist'], '3_months', {
    gender: 'female',
    bodyType: 'skinny_fat',
    requireBodyType: true,
  }) === null
)
assert(
  'hourglass still women-only 12m',
  getGoalByValue('hourglass_physique')?.tier === '12_months' &&
    getGoalByValue('hourglass_physique')?.genders?.includes('female') === true
)

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('\nAll plan-goal assertions passed')
