/**
 * First-plan gates must not block a finished intake for a false complexity jump
 * or a tape measurement that was added after they submitted.
 * Run: npx tsx scripts/verify-initial-plan-gates.ts
 */
import assert from 'node:assert/strict'
import {
  complexityMetricsFromProfile,
  evaluateComplexityInputs,
  profileBlocksAiPlanWork,
} from '../src/lib/complexity/input-guards'
import {
  shouldRequireNewOnboardingFields,
  validateOnboardingAnswersForProfile,
  validateOnboardingStep,
} from '../src/lib/onboarding'
import type { OnboardingProfile } from '../src/types/database'

const finished = profileBlocksAiPlanWork({
  age: 30,
  height: 159,
  weight: 82,
  gender: 'female',
  fitness_goal: 'recomposition',
  training_experience: 'beginner',
  diet_preference: 'vegetarian',
  injuries: 'knee',
  medical_notes: 'note',
  complexity_score: 42,
  complexity_input_needs_review: true,
  complexity_input_review_reasons: [
    'Your updated metrics would change coaching complexity from 42 to 6. Please re-check them.',
  ],
})
assert.equal(finished.blocked, false)

const partial = evaluateComplexityInputs(
  { age: 30, height: 159, weight: 82 },
  { previousDisplayScore: 42 }
)
assert.equal(partial.needsReview, true)

const samePerson = evaluateComplexityInputs(
  complexityMetricsFromProfile({
    age: 30,
    height: 159,
    weight: 82,
    gender: 'female',
    fitness_goal: 'recomposition',
    training_experience: 'beginner',
    diet_preference: 'vegetarian',
    injuries: 'knee',
    medical_notes: 'note',
  }),
  { previousDisplayScore: 42 }
)
assert.equal(samePerson.needsReview, false)

const impossible = profileBlocksAiPlanWork({
  age: 30,
  height: 159,
  weight: 20,
  gender: 'female',
  fitness_goal: 'recomposition',
  complexity_score: 42,
  complexity_input_needs_review: false,
})
assert.equal(impossible.blocked, true)

assert.equal(
  shouldRequireNewOnboardingFields({ plan_delivered: false, onboarding_complete: true }),
  false
)
assert.equal(
  shouldRequireNewOnboardingFields({ plan_delivered: false, onboarding_complete: false }),
  true
)

const finishedGoals = {
  fitness_goal: 'muscle_gain',
  selected_goals: [],
  coach_personalities: [],
  target_weight: '',
  goal_details: '',
  gender: 'male',
  starting_body_type: '',
} as Parameters<typeof validateOnboardingStep>[1]

assert.equal(
  validateOnboardingStep(2, finishedGoals, undefined, undefined, undefined, {
    requireMultiGoals: false,
    requireCoachPersonalities: false,
  }),
  null
)
assert.match(
  validateOnboardingStep(2, finishedGoals, undefined, undefined, undefined, {
    requireMultiGoals: false,
  }) ?? '',
  /coaching style/
)

assert.equal(
  validateOnboardingAnswersForProfile({
    onboarding_complete: true,
    plan_delivered: false,
    coach_personalities: [],
    training_days_per_week: '5',
    onboarding_data: { training: { availableDays: [] } },
  } as OnboardingProfile),
  null
)

console.log('✓ a finished intake is not blocked by a stale complexity flag or a later measurement')
