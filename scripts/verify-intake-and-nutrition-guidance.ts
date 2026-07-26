import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculateComplexityScore } from '../src/lib/ai/complexity-score'
import { buildPrompt } from '../src/lib/ai/prompt-builder'
import {
  buildOnboardingData,
  buildReviewSections,
  formFromProfile,
  INITIAL_ONBOARDING_FORM,
} from '../src/lib/onboarding'
import { profileToComplexityInput } from '../src/lib/complexity/profile-input'
import {
  PROGRESS_PHOTO_CAPTURE_GUIDANCE,
  PROGRESS_PHOTO_CLOTHING_GUIDANCE,
  PROGRESS_PHOTO_PRIVACY_NOTICE,
} from '../src/lib/progress-photo-guidance'
import type { Checkin, OnboardingFormData, OnboardingProfile } from '../src/types/database'

const form: OnboardingFormData = {
  ...INITIAL_ONBOARDING_FORM,
  name: 'Guidance Client',
  training_experience: 'intermediate',
  training_tenure: '1_to_2_years',
  previous_diet_attempts:
    'A very low calorie diet for three months caused low energy and no lasting weight loss.',
}

const onboardingData = buildOnboardingData(form, 15)
assert.equal(onboardingData.training?.trainingTenure, '1_to_2_years')
assert.equal(onboardingData.diet?.previousDietAttempts, form.previous_diet_attempts)

const profile = {
  id: 'guidance_client',
  name: form.name,
  age: 30,
  gender: 'male',
  height: 175,
  weight: 78,
  fitness_goal: 'fat_loss',
  activity_level: 'moderately_active',
  training_experience: form.training_experience,
  diet_preference: 'vegetarian',
  injuries: null,
  medical_notes: null,
  sleep_duration: '7_to_8',
  onboarding_data: onboardingData,
  onboarding_complete: false,
} as OnboardingProfile

const resumed = formFromProfile(profile)
assert.equal(resumed.training_tenure, form.training_tenure)
assert.equal(resumed.previous_diet_attempts, form.previous_diet_attempts)

const review = buildReviewSections(form, { front: null, side: null, back: null })
assert.equal(
  review.find((section) => section.title === 'Training')?.items.find((item) => item.label === 'Training history')?.value,
  '1 to 2 years'
)
assert.equal(
  review.find((section) => section.title === 'Diet')?.items.find((item) => item.label === 'Previous diet attempts')?.value,
  form.previous_diet_attempts
)
console.log('PASS training history and previous diet attempts persist, resume, and appear in review')

const latestCheckin = {
  id: 'checkin',
  client_id: profile.id,
  coach_id: 'coach',
  submitted_at: new Date().toISOString(),
  checkin_type: 'weekly',
  coaching_week: 3,
  weight: 78,
  navel: 90,
  energy_level: 4,
  hunger_level: 7,
  training_performance: 5,
  adherence_score: 9,
} as Checkin

const built = buildPrompt({
  profile,
  latestCheckin,
  complexityScore: calculateComplexityScore(profileToComplexityInput(profile, latestCheckin)),
  knowledgeEntries: [],
  actionId: 'review_update_diet',
  actionTemplate: 'Create the updated diet plan.',
})

assert.match(built.userPrompt, /training history 1 to 2 years/i)
assert.match(built.userPrompt, /very low calorie diet for three months/i)
assert.match(built.userPrompt, /gradual reverse diet/i)
assert.match(built.userPrompt, /do not cut calories again/i)
assert.match(built.userPrompt, /never force an oversized surplus/i)
assert.match(built.userPrompt, /Never claim that metabolism is broken, damaged, fixed, or repaired/i)
console.log('PASS AI context receives intake history and conservative calorie adjustment guardrails')

const [initialDietPrompt, updatedDietPrompt] = await Promise.all([
  readFile('prompts/production/initial-diet.prompt', 'utf8'),
  readFile('prompts/production/updated-diet.prompt', 'utf8'),
])
for (const prompt of [initialDietPrompt, updatedDietPrompt]) {
  assert.match(prompt, /low intake/i)
  assert.match(prompt, /50 to 100 kcal/i)
  assert.match(prompt, /never force an oversized surplus/i)
  assert.match(prompt, /metabolism is broken/i)
}
console.log('PASS production diet prompts preserve reverse dieting and gradual surplus rules')

assert.match(PROGRESS_PHOTO_PRIVACY_NOTICE, /never shared or published without your explicit permission/i)
assert.match(PROGRESS_PHOTO_CLOTHING_GUIDANCE, /keeps your chest and groin covered/i)
assert.match(PROGRESS_PHOTO_CLOTHING_GUIDANCE, /Do not upload nude, partially nude, or see through photos/i)
assert.match(PROGRESS_PHOTO_CAPTURE_GUIDANCE, /same outfit, lighting, and camera distance/i)
console.log('PASS progress photo guidance is private, clothed, and comparison ready')
