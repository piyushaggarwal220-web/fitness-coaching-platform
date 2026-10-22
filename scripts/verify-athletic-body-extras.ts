/**
 * Athletic body (12 months) bundles testo for men and hourglass guidance for women.
 */
import {
  ATHLETIC_BODY_PLAN_SLUG,
  HOURGLASS_GOAL,
  HOURGLASS_GUIDANCE_PROMPT,
  athleticBodyIncludesHourglassGuidance,
  isAthleticBodyPlan,
  planIncludesTestosteroneBoost,
  shouldApplyHourglassGuidance,
} from '../src/lib/athletic-body-extras'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed += 1
  } else {
    console.log(`PASS ${label}`)
  }
}

assert('12 months is athletic body', isAthleticBodyPlan(ATHLETIC_BODY_PLAN_SLUG))
assert('3 months is not athletic body', !isAthleticBodyPlan('3_months'))
assert('6 months is not athletic body', !isAthleticBodyPlan('6_months'))

assert(
  'athletic body men get testo',
  planIncludesTestosteroneBoost('12_months', 'male')
)
assert(
  '3-month offer men still get testo',
  planIncludesTestosteroneBoost('offer_3_months', 'male')
)
assert(
  'athletic body women do not get testo',
  !planIncludesTestosteroneBoost('12_months', 'female')
)
assert(
  'fat-loss men do not get bundled testo',
  !planIncludesTestosteroneBoost('3_months', 'male')
)

assert(
  'athletic body women get hourglass',
  athleticBodyIncludesHourglassGuidance('12_months', 'female')
)
assert(
  'athletic body men do not get hourglass',
  !athleticBodyIncludesHourglassGuidance('12_months', 'male')
)
assert(
  'fat-loss women do not get bundled hourglass',
  !athleticBodyIncludesHourglassGuidance('3_months', 'female')
)

assert(
  'selected hourglass still applies on any plan',
  shouldApplyHourglassGuidance({
    planSlug: '3_months',
    gender: 'female',
    selectedGoals: [HOURGLASS_GOAL],
  })
)
assert(
  'athletic body woman gets hourglass without selecting it',
  shouldApplyHourglassGuidance({ planSlug: '12_months', gender: 'female', selectedGoals: ['fat_loss'] })
)
assert(
  'man never gets hourglass even if selected',
  !shouldApplyHourglassGuidance({
    planSlug: '12_months',
    gender: 'male',
    selectedGoals: [HOURGLASS_GOAL],
  })
)
assert('hourglass prompt mentions glutes', /glute/i.test(HOURGLASS_GUIDANCE_PROMPT))
assert('hourglass prompt forbids male V-taper', /V-taper/i.test(HOURGLASS_GUIDANCE_PROMPT))

if (failed > 0) {
  console.error(`${failed} athletic-body extra checks failed`)
  process.exit(1)
}
console.log('athletic-body extras ok')
