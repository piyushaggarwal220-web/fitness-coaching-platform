/**
 * Verify home workout prompt integration (no gym fallback).
 * Run: npx tsx --env-file=.env.local scripts/verify-home-workout-integration.ts
 */
import { loadPublishedPromptsForAction } from '../src/lib/ai/prompt-library-loader'
import {
  getPromptCategoryForAction,
  resolveWorkoutEnvironment,
} from '../src/lib/ai/workout-prompt-selection'
import type { OnboardingProfile } from '../src/types/database'

let failures = 0

function fail(msg: string): void {
  failures++
  console.error(`FAIL: ${msg}`)
}

function pass(msg: string): void {
  console.log(`PASS: ${msg}`)
}

const homeProfile: OnboardingProfile = {
  id: 'home-client',
  name: 'Home Client',
  role: 'client',
  onboarding_data: {
    version: 1,
    training: {
      location: 'home',
      daysPerWeek: '4',
      equipmentAvailable: ['dumbbells', 'resistance_bands'],
    },
  },
  onboarding_complete: true,
}

const gymProfile: OnboardingProfile = {
  id: 'gym-client',
  name: 'Gym Client',
  role: 'client',
  onboarding_data: {
    version: 1,
    training: { location: 'gym', daysPerWeek: '4' },
  },
  onboarding_complete: true,
}

async function verifyHomeInitial(): Promise<void> {
  const category = getPromptCategoryForAction('initial_workout', homeProfile)
  if (category !== 'initial_workout_home') {
    fail(`home initial category expected initial_workout_home, got ${category}`)
    return
  }

  const loaded = await loadPublishedPromptsForAction('initial_workout', homeProfile)
  if (!loaded) {
    fail('no published home initial workout prompt')
    return
  }
  if (loaded.resolvedCategory !== 'initial_workout_home') {
    fail(`resolved category mismatch: ${loaded.resolvedCategory}`)
    return
  }
  if (loaded.action.category !== 'initial_workout_home') {
    fail(`loaded action category is ${loaded.action.category}, not home`)
    return
  }
  pass(`home initial workout → ${loaded.action.slug}@v${loaded.action.version}`)
}

async function verifyHomeWeekly(): Promise<void> {
  const category = getPromptCategoryForAction('review_update_workout', homeProfile)
  if (category !== 'weekly_workout_update_home') {
    fail(`home weekly category expected weekly_workout_update_home, got ${category}`)
    return
  }

  const loaded = await loadPublishedPromptsForAction('review_update_workout', homeProfile)
  if (!loaded) {
    fail('no published home weekly workout prompt')
    return
  }
  if (loaded.action.category !== 'weekly_workout_update_home') {
    fail(`loaded weekly action category is ${loaded.action.category}`)
    return
  }
  pass(`home weekly workout → ${loaded.action.slug}@v${loaded.action.version}`)
}

async function verifyGymUnchanged(): Promise<void> {
  if (resolveWorkoutEnvironment(gymProfile) !== 'gym') {
    fail('gym profile resolved as non-gym')
    return
  }
  const loaded = await loadPublishedPromptsForAction('initial_workout', gymProfile)
  if (!loaded || loaded.action.category !== 'initial_workout') {
    fail('gym client did not receive gym initial workout prompt')
    return
  }
  pass(`gym initial workout → ${loaded.action.slug}@v${loaded.action.version}`)
}

async function main(): Promise<void> {
  console.log('=== Home Workout Integration Verification ===\n')
  await verifyHomeInitial()
  await verifyHomeWeekly()
  await verifyGymUnchanged()

  console.log('')
  if (failures > 0) {
    console.error(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('All home workout integration checks passed.')
}

void main()
