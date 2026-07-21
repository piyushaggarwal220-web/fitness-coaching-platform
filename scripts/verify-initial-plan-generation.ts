import assert from 'node:assert/strict'
import {
  canRetryInitialGeneration,
  INITIAL_GENERATION_CLAIM_STATUS,
  shouldStartInitialGeneration,
  validateAuthoritativeOnboarding,
} from '../src/lib/initial-plan-generation-policy'
import {
  buildProfilePayload,
  INITIAL_ONBOARDING_FORM,
  ONBOARDING_SCREEN_COUNT,
} from '../src/lib/onboarding'
import {
  AI_DRAFT_DELIVERY_STATE,
  hasAuthoritativeOnboardingCompletion,
} from '../src/lib/plans'
import type { OnboardingFormData, OnboardingProfile } from '../src/types/database'

const form: OnboardingFormData = {
  ...INITIAL_ONBOARDING_FORM,
  name: 'Verification Client',
  age: '30',
  gender: 'male',
  height: '175',
  weight: '75',
  fitness_goal: 'fat_loss',
  target_weight: '68',
  goal_deadline: '12_weeks',
  biggest_struggle: 'consistency',
  occupation: 'desk_job',
  activity_level: 'lightly_active',
  daily_steps: '5000_7500',
  sleep_duration: '7_8',
  stress_level: 'moderate',
  water_intake: '2_3',
  training_location: 'gym',
  training_experience: 'beginner',
  training_days_per_week: '4',
  workout_duration: '45_60',
  preferred_workout_time: 'morning',
  acne_status: 'none',
  hair_loss_status: 'none',
  sexual_health_status: 'normal',
  pain_during_exercise: 'none',
  diet_preference: 'vegetarian',
  whey_protein: 'yes',
  monthly_food_budget: '8000',
  cooking_ability: 'basic',
  breakfast: 'Oats and fruit',
  lunch: 'Rice, dal, and vegetables',
  dinner: 'Roti and paneer',
  snacks: 'Fruit',
  timing_breakfast: '08:00',
  timing_lunch: '13:00',
  timing_dinner: '20:00',
  timing_snacks: '17:00',
  current_supplements: 'None',
  terms_accepted: true,
}

const complete = buildProfilePayload(form, '00000000-0000-4000-8000-000000000001', {
  resumeStep: ONBOARDING_SCREEN_COUNT - 1,
  complete: true,
  photoUrls: { front: 'front.jpg', side: 'side.jpg', back: 'back.jpg' },
}) as OnboardingProfile
complete.coach_id = '00000000-0000-4000-8000-000000000002'

assert.equal(validateAuthoritativeOnboarding(complete), null)
assert.match(
  validateAuthoritativeOnboarding({ ...complete, onboarding_complete: false }),
  /not complete/i
)
assert.match(
  validateAuthoritativeOnboarding({ ...complete, progress_photo_back: null }),
  /back progress photo/i
)
assert.equal(
  validateAuthoritativeOnboarding({
    ...complete,
    gender: 'female',
    progress_photo_front: null,
    progress_photo_side: null,
    progress_photo_back: null,
  }),
  null
)

assert.equal(INITIAL_GENERATION_CLAIM_STATUS, 'queued')
assert.equal(shouldStartInitialGeneration('queued'), true)
assert.equal(shouldStartInitialGeneration('generating'), false)
assert.equal(shouldStartInitialGeneration('ready'), false)
assert.equal(canRetryInitialGeneration('failed'), true)
assert.equal(canRetryInitialGeneration('generating'), false)
assert.deepEqual(AI_DRAFT_DELIVERY_STATE, { active: false, delivered_at: null })
assert.equal(
  hasAuthoritativeOnboardingCompletion({
    onboarding_complete: true,
  }),
  true,
  'delivery must accept the same authoritative completion flag as the database trigger'
)

console.log('✓ incomplete onboarding and required photos are gated while female photos remain optional')
console.log('✓ duplicate workers only claim queued jobs')
console.log('✓ only failed jobs are retryable')
console.log('✓ generated plans remain inactive, undelivered drafts')
console.log('✓ delivery uses the authoritative onboarding completion flag')
