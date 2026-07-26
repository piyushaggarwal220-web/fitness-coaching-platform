import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { calculateComplexityScore } from '../src/lib/ai/complexity-score'
import {
  containsClientPlanDash,
  generatedPlanToFormData,
} from '../src/lib/ai/plan-format'
import { resolveMesocycle } from '../src/lib/ai/mesocycle'
import { buildMockGeneratedPlan } from '../src/lib/ai/mock-plan-provider'
import { buildPrompt } from '../src/lib/ai/prompt-builder'
import { resolveAppendOrderForAction } from '../src/lib/ai/prompt-cache/assembly'
import { profileToComplexityInput } from '../src/lib/complexity/profile-input'
import type { Checkin, OnboardingProfile } from '../src/types/database'

const profile = {
  id: 'verify_client',
  email: 'verify@example.com',
  name: 'Verify Client',
  role: 'client',
  age: 32,
  gender: 'male',
  height: 175,
  weight: 78,
  fitness_goal: 'muscle_gain',
  activity_level: 'moderate',
  training_experience: 'intermediate',
  diet_preference: 'balanced',
  sleep_duration: '7_8',
  injuries: null,
  medical_notes: null,
  onboarding_data: {
    version: 1,
    resumeStep: 22,
    training: {
      daysPerWeek: '4',
      location: 'gym',
      equipmentAvailable: ['barbell', 'dumbbells'],
    },
  },
  onboarding_complete: true,
  plan_delivered: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as OnboardingProfile

function checkin(coachingWeek: number): Checkin {
  return {
    id: `checkin_${coachingWeek}`,
    client_id: profile.id,
    coach_id: 'coach',
    submitted_at: new Date().toISOString(),
    coaching_week: coachingWeek,
    energy_level: 8,
    hunger_level: 5,
    training_performance: 8,
    adherence_score: 9,
    created_at: new Date().toISOString(),
  } as Checkin
}

async function main() {
  const first = resolveMesocycle(1)
  const peak = resolveMesocycle(4)
  const reset = resolveMesocycle(5)

  assert.equal(first.weekInMesocycle, 1)
  assert.equal(peak.weekInMesocycle, 4)
  assert.equal(reset.weekInMesocycle, 1)
  assert.equal(reset.mesocycleIndex, 2)
  assert.equal(first.calorieAdjustmentKcal, 0)
  assert.equal(peak.calorieAdjustmentKcal, 180)
  assert.equal(reset.calorieAdjustmentKcal, 0)
  assert.match(first.calorieGuidance, /BASE calorie intake/)
  assert.match(peak.calorieGuidance, /Increase average daily intake/)
  assert.match(reset.calorieGuidance, /reduce average daily intake by about 100 to 200 kcal/)
  const baseCalories = buildMockGeneratedPlan(profile, checkin(1)).nutrition_plan.calories
  const peakCalories = buildMockGeneratedPlan(profile, checkin(4)).nutrition_plan.calories
  const resetCalories = buildMockGeneratedPlan(profile, checkin(5)).nutrition_plan.calories
  assert.equal(peakCalories - baseCalories, 180)
  assert.equal(resetCalories, baseCalories)
  console.log('PASS calorie guidance rises through the cycle and resets at the next split')

  assert.ok(resolveAppendOrderForAction('initial_diet').includes('mesocycle'))
  assert.ok(resolveAppendOrderForAction('review_update_diet').includes('mesocycle'))
  console.log('PASS diet prompt cache assembly includes Training Mesocycle context')

  const complexityScore = calculateComplexityScore(profileToComplexityInput(profile, checkin(5)))
  const built = buildPrompt({
    profile,
    latestCheckin: checkin(5),
    complexityScore,
    knowledgeEntries: [],
    actionId: 'review_update_diet',
    actionTemplate: 'Create the updated diet plan.',
  })
  assert.match(built.userPrompt, /## Training Mesocycle and Calorie Wave/)
  assert.match(built.userPrompt, /reduce average daily intake by about 100 to 200 kcal/)
  console.log('PASS weekly diet generation receives the cycle reset calorie instruction')

  const generated = buildMockGeneratedPlan(profile, checkin(3))
  generated.workout_plan.overview = 'Three-day strength plan — 8–12 reps'
  generated.coach_notes = 'Use well-balanced post-workout meals.'
  const form = generatedPlanToFormData(generated, profile.id)
  const clientFields = [
    form.title,
    form.phase,
    form.workout_plan,
    form.nutrition_plan,
    form.cardio_plan,
    form.supplement_plan,
    form.coach_notes,
  ]
  assert.ok(clientFields.every((value) => !containsClientPlanDash(value)))
  assert.match(form.workout_plan, /Three day strength plan 8 to 12 reps/)
  assert.match(form.coach_notes, /well balanced post workout meals/)
  console.log('PASS generated client plan fields contain no hyphen or dash characters')

  const promptFiles = [
    'initial-diet.prompt',
    'updated-diet.prompt',
    'initial-workout.prompt',
    'updated-workout.prompt',
    'initial-workout-home.prompt',
    'updated-workout-home.prompt',
  ]
  for (const file of promptFiles) {
    const body = await readFile(`prompts/production/${file}`, 'utf8')
    assert.match(body, /Never use any hyphen or dash character in client-facing plan text/)
  }
  const updatedDiet = await readFile('prompts/production/updated-diet.prompt', 'utf8')
  assert.match(updatedDiet, /Training Mesocycle calorie wave/)
  assert.match(updatedDiet, /50 to 100 kcal/)
  assert.match(updatedDiet, /100 to 200 kcal/)
  console.log('PASS production prompt files persist both client plan invariants')

  const clientPage = await readFile('src/app/plan/page.tsx', 'utf8')
  assert.match(clientPage, /normalizeAiPlanProse\(resolvedSections\.diet\)/)
  assert.match(clientPage, /normalizeAiPlanProse\(plan\.title\)/)
  console.log('PASS legacy active plans are sanitized at client display time')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
