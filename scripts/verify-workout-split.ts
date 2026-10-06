import assert from 'node:assert/strict'
import {
  detectWorkoutSplit,
  defaultWorkoutSplit,
  resolveStickySplit,
  normalizeOnboardingSplitPreference,
  normalizeCheckinSplitPreference,
  formatStickySplitGuidance,
} from '../src/lib/ai/workout-split'

const pplProse = `Day 1 (Monday) — Push
Bench press 3x8
Day 2 (Tuesday) — Pull
Rows 3x8
Day 3 (Wednesday) — Legs
Squat 3x8`

assert.equal(detectWorkoutSplit(pplProse), 'ppl')
assert.equal(detectWorkoutSplit('Push\nPull\nLegs'), 'ppl')
assert.equal(
  detectWorkoutSplit('Day 1 Upper body\nDay 2 Lower body\nDay 3 Upper hypertrophy'),
  'upper_lower'
)
assert.equal(detectWorkoutSplit('Full body session A'), 'full_body')
assert.equal(detectWorkoutSplit('random cardio walk'), 'unknown')

const beginner = {
  fitness_goal: 'fat_loss',
  training_experience: 'beginner',
  onboarding_data: { training: { daysPerWeek: '4' } },
} as const
assert.equal(defaultWorkoutSplit(beginner), 'full_body')

const sixDay = {
  fitness_goal: 'muscle_gain',
  training_experience: 'intermediate',
  onboarding_data: { training: { daysPerWeek: '6' } },
} as const
assert.equal(defaultWorkoutSplit(sixDay), 'ppl')

const fourDay = {
  fitness_goal: 'muscle_gain',
  training_experience: 'intermediate',
  onboarding_data: { training: { daysPerWeek: '4' } },
} as const
assert.equal(defaultWorkoutSplit(fourDay), 'upper_lower')

const keep = resolveStickySplit(pplProse, fourDay, 'keep')
assert.equal(keep.kind, 'ppl')
assert.equal(keep.source, 'prior')
assert.equal(keep.mode, 'keep')

const named = resolveStickySplit(pplProse, fourDay, 'full_body')
assert.equal(named.kind, 'full_body')
assert.equal(named.mode, 'change')

const changeSystem = resolveStickySplit(pplProse, fourDay, 'change_system')
assert.equal(changeSystem.mode, 'change')
assert.notEqual(changeSystem.kind, 'ppl') // must alternate away from prior when default matches

const onboardingNamed = resolveStickySplit(null, {
  ...fourDay,
  onboarding_data: { training: { daysPerWeek: '4', workoutSplitPreference: 'ppl' } },
}, null)
assert.equal(onboardingNamed.kind, 'ppl')
assert.equal(onboardingNamed.source, 'onboarding')

assert.equal(normalizeOnboardingSplitPreference('system_decide'), 'system_decide')
assert.equal(normalizeOnboardingSplitPreference('nope'), null)
assert.equal(normalizeCheckinSplitPreference('change_system'), 'change_system')
assert.equal(normalizeCheckinSplitPreference('weird'), null)

const guidance = formatStickySplitGuidance({
  priorWorkout: pplProse,
  profile: fourDay,
  checkinSplitPreference: 'keep',
})
assert.match(guidance, /Sticky workout split/i)
assert.match(guidance, /KEEP/i)
assert.doesNotMatch(guidance, /\bAI picks\b/i)

console.log('All workout-split checks passed')
