/**
 * Verifies plan lifestyle helpers (sleep/water visibility + supplements opt-in).
 * Run: npx tsx scripts/verify-plan-lifestyle.ts
 */
import assert from 'node:assert/strict'
import {
  clientWantsSupplements,
  ensurePlanLifestyleSections,
  extractSleepGuidance,
  extractWaterGuidance,
  resolveClientPlanDisplaySections,
} from '../src/lib/plan-lifestyle'
import type { OnboardingProfile } from '../src/types/database'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

const profile = {
  id: 'c1',
  name: 'Asha',
  sleep_duration: '6_to_7',
  onboarding_data: {
    lifestyle: { waterIntake: '1_2L' },
    diet: { wheyProtein: 'no' },
    supplements: { current: 'None' },
  },
} as OnboardingProfile

assert.equal(clientWantsSupplements(profile), false)
pass('client with whey=no and None does not want supplements')

assert.equal(
  clientWantsSupplements({
    ...profile,
    onboarding_data: {
      ...profile.onboarding_data,
      diet: { wheyProtein: 'yes' },
      supplements: { current: 'None' },
    },
  } as OnboardingProfile),
  true
)
pass('client with whey=yes wants supplements')

const ensured = ensurePlanLifestyleSections(
  {
    client_id: 'c1',
    title: 'Test',
    phase: '',
    workout_plan: 'Day 1\nSquat 3x8',
    nutrition_plan: 'Day 1\nBreakfast oats',
    cardio_plan: '8000 steps daily',
    supplement_plan: 'Creatine 5g',
    coach_notes: '',
  },
  profile
)

assert.equal(ensured.supplement_plan, '')
assert.match(ensured.cardio_plan, /Water Intake/i)
assert.match(ensured.cardio_plan, /Sleep Guidance/i)
pass('ensure adds sleep/water and clears unwanted supplements')

const display = resolveClientPlanDisplaySections(
  {
    diet: 'Day 1 meals',
    workout: 'Day 1 lifts\n\nSleep Guidance\nOld sleep text in workout',
    supplements: '',
    cardio: ensured.cardio_plan,
    coachNotes: 'Stay consistent this week.',
  },
  profile
)

const titles = display.map((d) => d.title)
assert.deepEqual(
  titles.filter((t) =>
    ['Diet Chart', 'Workout Plan', 'Sleep Guidance', 'Cardio Guidance', 'Water Intake', 'Coach Notes'].includes(t)
  ),
  ['Diet Chart', 'Workout Plan', 'Sleep Guidance', 'Cardio Guidance', 'Water Intake', 'Coach Notes']
)
assert.ok(!titles.includes('Supplement Guidance'))
pass('client display shows required sections without supplements')

const sleep = extractSleepGuidance(ensured.cardio_plan)
const water = extractWaterGuidance(ensured.cardio_plan)
assert.ok(sleep.includes('7 to 8'))
assert.ok(water.includes('2.5 L') || water.includes('2500'))
pass('extracts sleep/water targets from cardio prose')

console.log('\nAll plan lifestyle checks passed.')
