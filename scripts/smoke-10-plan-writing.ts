/**
 * Generate a diet and a workout for 10 fake clients, score them, then delete the trials.
 * Does not activate a plan on a real client.
 *
 *   npx tsx --env-file=.env.local scripts/smoke-10-plan-writing.ts
 */
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeTrialClient } from '../src/lib/admin/testing-accounts'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { generatedDietFormData, generatedWorkoutFormData } from '../src/lib/ai/plan-format'
import { resolveClientCalorieTargets } from '../src/lib/ai/calorie-targets'
import { inferMacrosFromDietText } from '../src/lib/ai/nutrition-macro-sync'
import { assessWorkoutStructure } from '../src/lib/ai/workout-structure'
import { dietScanOptionsFromProfile, enforceDietPreference } from '../src/lib/ai/diet-preference-guard'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { Checkin, OnboardingFormData, OnboardingProfile, Plan } from '../src/types/database'

process.env.AI_PLAN_PROVIDER = process.env.AI_PLAN_PROVIDER || 'openai'

type Check = { name: string; ok: boolean; detail: string }
type Mode = 'initial' | 'weekly'

type Person = {
  id: string
  mode: Mode
  form: Partial<OnboardingFormData> & { name: string }
  split: string
  place: 'home' | 'gym'
  staple: RegExp
  forbiddenKit?: RegExp
  pain?: string | null
}

const PEOPLE: Person[] = [
  {
    id: 'home-veg-beginner',
    mode: 'initial',
    place: 'home',
    split: 'ppl',
    staple: /poha|dal|roti|paneer/i,
    form: {
      name: 'Meera Home',
      gender: 'female',
      age: '29',
      weight: '70',
      height: '160',
      fitness_goal: 'fat_loss',
      occupation: 'desk_job',
      activity_level: 'sedentary',
      training_location: 'home',
      training_experience: 'beginner',
      training_days_per_week: '3',
      training_available_days: ['monday', 'wednesday', 'friday'],
      workout_duration: '45',
      workout_split_preference: 'ppl',
      equipment_available: ['dumbbells', 'resistance bands', 'yoga mat'],
      gym_stations: [],
      injuries: 'None',
      medical_notes: '',
      food_allergies: '',
      diet_preference: 'vegetarian',
      whey_protein: 'no',
      favorite_foods: 'dal, roti, paneer, curd, rice',
      foods_disliked: 'mushroom',
      breakfast: 'poha and chai',
      lunch: 'dal rice',
      dinner: 'roti and paneer',
    },
  },
  {
    id: 'gym-nonveg-ppl',
    mode: 'initial',
    place: 'gym',
    split: 'ppl',
    staple: /chicken|rice|egg|roti/i,
    form: {
      name: 'Arjun Gym',
      gender: 'male',
      age: '32',
      weight: '84',
      height: '178',
      fitness_goal: 'muscle_gain',
      occupation: 'desk_job',
      activity_level: 'moderately_active',
      training_location: 'gym',
      training_experience: 'intermediate',
      training_days_per_week: '6',
      training_available_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      workout_duration: '70',
      workout_split_preference: 'ppl',
      recent_program: 'Push pull legs for a year',
      diet_preference: 'non_veg',
      whey_protein: 'no',
      chicken_days: '2',
      chicken_allowed_days: ['monday', 'thursday'],
      egg_days: '0',
      fish_days: '0',
      favorite_foods: 'chicken, rice, roti, dal',
      breakfast: 'oats and milk',
      lunch: 'chicken and rice',
      dinner: 'roti and dal',
    },
  },
  {
    id: 'gym-egg-upper',
    mode: 'initial',
    place: 'gym',
    split: 'upper_lower',
    staple: /egg|paneer|oats|roti/i,
    form: {
      name: 'Sana Upper',
      gender: 'female',
      age: '34',
      weight: '66',
      height: '165',
      fitness_goal: 'body_recomposition',
      occupation: 'desk_job',
      activity_level: 'lightly_active',
      training_location: 'gym',
      training_experience: 'advanced',
      training_days_per_week: '4',
      training_available_days: ['monday', 'tuesday', 'thursday', 'friday'],
      workout_duration: '60',
      workout_split_preference: 'upper_lower',
      recent_program: 'Upper lower for four years',
      diet_preference: 'eggetarian',
      whey_protein: 'no',
      egg_days: '2',
      egg_allowed_days: ['tuesday', 'friday'],
      favorite_foods: 'eggs, oats, paneer, rice',
      breakfast: 'oats',
      lunch: 'paneer and rice',
      dinner: 'roti and dal',
    },
  },
  {
    id: 'home-vegan-bands',
    mode: 'initial',
    place: 'home',
    split: 'upper_lower',
    staple: /dal|tofu|soya|roti|rice/i,
    forbiddenKit: /\b(dumbbell|barbell|cable|lat pulldown|leg press|smith)\b/i,
    form: {
      name: 'Kabir Bands',
      gender: 'male',
      age: '26',
      weight: '74',
      height: '174',
      fitness_goal: 'fat_loss',
      occupation: 'desk_job',
      activity_level: 'lightly_active',
      training_location: 'home',
      training_experience: 'beginner',
      training_days_per_week: '4',
      training_available_days: ['monday', 'tuesday', 'thursday', 'friday'],
      workout_duration: '40',
      workout_split_preference: 'upper_lower',
      equipment_available: ['resistance bands', 'yoga mat'],
      diet_preference: 'vegan',
      whey_protein: 'no',
      favorite_foods: 'dal, roti, rice, tofu, soya chunks',
      breakfast: 'poha',
      lunch: 'dal and rice',
      dinner: 'roti and soya',
    },
  },
  {
    id: 'gym-shoulder',
    mode: 'initial',
    place: 'gym',
    split: 'upper_lower',
    staple: /roti|dal|curd|rice/i,
    pain: 'Left shoulder is sore. Do not write overhead press, shoulder press, or military press.',
    form: {
      name: 'Dev Shoulder',
      gender: 'male',
      age: '41',
      weight: '90',
      height: '175',
      fitness_goal: 'fat_loss',
      occupation: 'desk_job',
      activity_level: 'sedentary',
      training_location: 'gym',
      training_experience: 'beginner',
      training_days_per_week: '3',
      training_available_days: ['monday', 'wednesday', 'friday'],
      workout_duration: '45',
      workout_split_preference: 'upper_lower',
      diet_preference: 'vegetarian',
      whey_protein: 'no',
      favorite_foods: 'roti, dal, curd, rice',
      breakfast: 'idli and sambar',
      lunch: 'dal rice',
      dinner: 'roti and curd',
    },
  },
  {
    id: 'gym-recomp',
    mode: 'initial',
    place: 'gym',
    split: 'ppl',
    staple: /paneer|dal|roti/i,
    form: {
      name: 'Ira Recomp',
      gender: 'female',
      age: '27',
      weight: '62',
      height: '158',
      fitness_goal: 'body_recomposition',
      occupation: 'desk_job',
      activity_level: 'moderately_active',
      training_location: 'gym',
      training_experience: 'intermediate',
      training_days_per_week: '3',
      training_available_days: ['monday', 'wednesday', 'friday'],
      workout_duration: '55',
      workout_split_preference: 'ppl',
      diet_preference: 'vegetarian',
      whey_protein: 'no',
      foods_disliked: 'mushroom, bitter gourd',
      favorite_foods: 'paneer, dal, roti, curd',
      breakfast: 'poha',
      lunch: 'paneer and roti',
      dinner: 'dal and roti',
    },
  },
  {
    id: 'weekly-keep-ppl',
    mode: 'weekly',
    place: 'gym',
    split: 'ppl',
    staple: /rice|dal|roti/i,
    form: {
      name: 'Nikhil Keep',
      gender: 'male',
      age: '30',
      weight: '78',
      height: '176',
      fitness_goal: 'muscle_gain',
      occupation: 'desk_job',
      activity_level: 'moderately_active',
      training_location: 'gym',
      training_experience: 'intermediate',
      training_days_per_week: '6',
      training_available_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      workout_duration: '60',
      workout_split_preference: 'ppl',
      diet_preference: 'vegetarian',
      whey_protein: 'no',
      favorite_foods: 'rice, dal, roti, curd, paneer',
      breakfast: 'oats',
      lunch: 'dal rice',
      dinner: 'roti and paneer',
    },
  },
  {
    id: 'weekly-home-sleep',
    mode: 'weekly',
    place: 'home',
    split: 'upper_lower',
    staple: /roti|dal|paneer/i,
    form: {
      name: 'Pooja Sleep',
      gender: 'female',
      age: '33',
      weight: '72',
      height: '163',
      fitness_goal: 'fat_loss',
      occupation: 'desk_job',
      activity_level: 'sedentary',
      training_location: 'home',
      training_experience: 'beginner',
      training_days_per_week: '4',
      training_available_days: ['monday', 'tuesday', 'thursday', 'friday'],
      workout_duration: '40',
      workout_split_preference: 'upper_lower',
      equipment_available: ['dumbbells', 'yoga mat'],
      diet_preference: 'vegetarian',
      whey_protein: 'no',
      favorite_foods: 'roti, dal, paneer, curd',
      breakfast: 'poha',
      lunch: 'dal roti',
      dinner: 'paneer and roti',
    },
  },
  {
    id: 'weekly-chicken-wed',
    mode: 'weekly',
    place: 'gym',
    split: 'upper_lower',
    staple: /chicken|dal|rice|roti/i,
    form: {
      name: 'Farhan Wed',
      gender: 'male',
      age: '38',
      weight: '88',
      height: '180',
      fitness_goal: 'fat_loss',
      occupation: 'desk_job',
      activity_level: 'lightly_active',
      training_location: 'gym',
      training_experience: 'intermediate',
      training_days_per_week: '4',
      training_available_days: ['monday', 'tuesday', 'thursday', 'friday'],
      workout_duration: '60',
      workout_split_preference: 'upper_lower',
      diet_preference: 'non_veg',
      whey_protein: 'no',
      chicken_days: '1',
      chicken_allowed_days: ['wednesday'],
      egg_days: '0',
      egg_allowed_days: [],
      fish_days: '0',
      fish_allowed_days: [],
      injuries: 'None',
      medical_notes: '',
      food_allergies: '',
      gym_stations: [],
      favorite_foods: 'chicken, rice, roti, dal',
      breakfast: 'oats',
      lunch: 'chicken and rice',
      dinner: 'roti and dal',
    },
  },
  {
    id: 'weekly-egg-saturday',
    mode: 'weekly',
    place: 'gym',
    split: 'ppl',
    staple: /egg|paneer|roti|dal/i,
    form: {
      name: 'Leela Saturday',
      gender: 'female',
      age: '24',
      weight: '58',
      height: '162',
      fitness_goal: 'muscle_gain',
      occupation: 'student',
      activity_level: 'lightly_active',
      training_location: 'gym',
      training_experience: 'beginner',
      training_days_per_week: '3',
      training_available_days: ['monday', 'wednesday', 'friday'],
      workout_duration: '50',
      workout_split_preference: 'ppl',
      diet_preference: 'eggetarian',
      whey_protein: 'no',
      egg_days: '1',
      egg_allowed_days: ['saturday'],
      favorite_foods: 'eggs, paneer, roti, dal',
      breakfast: 'poha',
      lunch: 'paneer and roti',
      dinner: 'dal and rice',
    },
  },
]

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function checkinFor(person: Person, clientId: string): Checkin {
  const tired = person.id === 'weekly-home-sleep'
  return {
    id: `smoke-${person.id}`,
    client_id: clientId,
    coach_id: null,
    checkin_type: 'weekly',
    coaching_week: person.mode === 'weekly' ? 4 : 1,
    workout_split_preference: person.split,
    workout_difficulty: 'keep',
    diet_adherence: 7,
    workout_adherence: tired ? 4 : 7,
    days_followed_diet: 5,
    days_followed_workout: tired ? 2 : 4,
    energy_level: tired ? 3 : 7,
    sleep_quality: tired ? 2 : 7,
    stress_level: 4,
    hunger_level: 5,
    motivation_level: 7,
    progress_rating: 6,
    weight: Number(person.form.weight),
    notes: tired ? 'Slept badly most nights. Please keep the same split and make the weights easier.' : 'Keep the current split.',
    pain_injuries: person.pain ?? null,
  } as Checkin
}

function stubPlan(clientId: string, nutrition: string, workout: string): Plan {
  return {
    id: 'smoke-active',
    client_id: clientId,
    coach_id: '',
    title: 'Current plan',
    phase: null,
    nutrition_plan: nutrition,
    workout_plan: workout,
    cardio_plan: null,
    supplement_plan: null,
    coach_notes: null,
    version: 1,
    active: true,
    delivered_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function scoreText(kind: 'diet' | 'workout', text: string): Check[] {
  const missing = DAYS.filter((day, index) => !new RegExp(`Day\\s*${index + 1}\\s*\\(\\s*${day}\\s*\\)`, 'i').test(text))
  return [
    { name: `${kind} has Day 1 through Day 7`, ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(', ')}` : 'all 7' },
    { name: `${kind} has no cross-day pointer`, ok: !/same as|repeat monday|repeat tuesday|as above/i.test(text), detail: 'pointers' },
    { name: `${kind} has no Power or Hypertrophy title`, ok: !/\b(power|hypertrophy|density)\b/i.test(text), detail: 'titles' },
    { name: `${kind} has no week number greeting`, ok: !/welcome to week|week\s+\d+/i.test(text), detail: 'week talk' },
  ]
}

function scoreDiet(text: string, profile: OnboardingProfile, person: Person): Check[] {
  const inferred = inferMacrosFromDietText(text)
  const targets = resolveClientCalorieTargets(profile)
  const preferred = targets?.preferred ?? null
  const scan = dietScanOptionsFromProfile(profile)
  const preference = enforceDietPreference({ meals: [] }, profile.diet_preference, { ...scan, extraProse: text })
  const checks = [
    ...scoreText('diet', text),
    { name: 'Diet follows preference and weekdays', ok: preference.ok, detail: preference.ok ? profile.diet_preference ?? '' : preference.error ?? 'violation' },
    { name: 'Diet uses a usual food', ok: person.staple.test(text), detail: person.staple.source },
    { name: 'Diet has no disliked mushroom', ok: !/mushroom/i.test(text), detail: 'mushroom' },
  ]
  if (preferred != null && inferred) {
    const delta = inferred.calories - preferred
    checks.push({
      name: 'Diet calories sit on the target',
      ok: delta <= 150 && delta >= -100,
      detail: `food ${inferred.calories} vs target ${preferred} (${delta >= 0 ? '+' : ''}${delta})`,
    })
  } else {
    checks.push({
      name: 'Diet calories sit on the target',
      ok: false,
      detail: preferred == null ? 'calorie target unavailable' : 'could not read meal calories',
    })
  }
  return checks
}

function scoreWorkout(text: string, person: Person): Check[] {
  const structure = assessWorkoutStructure(text, null, person.pain)
  const heavy = /\b([5-9]|\d{2,})\s+sets?\s*x\b/i.test(text)
  const homeKit = /\b(barbell|smith|leg press|lat pulldown|cable|hack squat)\b/i.test(text)
  const splitOk =
    person.split === 'ppl'
      ? /\bpush\b/i.test(text) && /\bpull\b/i.test(text) && /\bleg/i.test(text)
      : /\bupper\b/i.test(text) && /\blower\b/i.test(text)
  const checks: Check[] = [
    ...scoreText('workout', text),
    { name: 'Workout structure passes', ok: structure.length === 0, detail: structure[0] ?? 'clean' },
    { name: 'Workout stays at 4 sets or fewer', ok: !heavy, detail: heavy ? '5 or more sets' : 'ok' },
    { name: 'Workout keeps the split', ok: splitOk, detail: person.split },
    {
      name: 'Workout matches the place',
      ok: person.place === 'home' ? !homeKit : true,
      detail: person.place === 'home' && homeKit ? 'gym machine in a home plan' : person.place,
    },
  ]
  if (person.forbiddenKit) {
    checks.push({
      name: 'Workout uses only the listed kit',
      ok: !person.forbiddenKit.test(text),
      detail: person.forbiddenKit.test(text) ? 'listed a tool they do not have' : 'kit ok',
    })
  }
  if (person.pain) {
    checks.push({
      name: 'Workout leaves out shoulder press',
      ok: !/^\s*(overhead press|shoulder press|military press)\b/im.test(text),
      detail: 'shoulder',
    })
  }
  return checks
}

async function cleanup(clientId: string, email: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('plans').delete().eq('client_id', clientId)
  await admin.from('profiles').delete().eq('id', clientId)
  await admin.auth.admin.deleteUser(clientId)
  console.log(`Deleted trial ${email}`)
}

async function main(): Promise<void> {
  const report: Array<Record<string, unknown>> = []
  let failures = 0
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length)
  const selected = only ? PEOPLE.filter((person) => only.split(',').includes(person.id)) : PEOPLE
  if (selected.length === 0) throw new Error(`No smoke client matches ${only}`)
  for (const person of selected) {
    console.log(`\n=== ${person.id} (${person.mode}) ===`)
    const account = await createFakeTrialClient(null, person.form)
    try {
      const admin = createAdminClient()
      const { data: profile, error } = await admin.from('profiles').select('*').eq('id', account.userId).single()
      if (error || !profile) throw new Error(error?.message ?? 'profile missing')
      const onboarding = profile as OnboardingProfile
      const checkin = checkinFor(person, account.userId)
      const dietAction = person.mode === 'initial' ? 'initial_diet' : 'review_update_diet'
      const workoutAction = person.mode === 'initial' ? 'initial_workout' : 'review_update_workout'
      const active =
        person.mode === 'weekly'
          ? stubPlan(
              account.userId,
              'Current meals are the foods they already listed. Keep those plates and adjust portions.',
              person.split === 'ppl'
                ? 'Day 1 (Monday): Push\nDay 2 (Tuesday): Pull\nDay 3 (Wednesday): Legs\nDay 4 (Thursday): Push\nDay 5 (Friday): Pull\nDay 6 (Saturday): Legs\nDay 7 (Sunday): Rest'
                : 'Day 1 (Monday): Upper\nDay 2 (Tuesday): Lower\nDay 3 (Wednesday): Rest\nDay 4 (Thursday): Upper\nDay 5 (Friday): Lower\nDay 6 (Saturday): Rest\nDay 7 (Sunday): Rest'
            )
          : null
      console.log('  diet…')
      const dietResult = await generatePlan({
        profile: onboarding,
        latestCheckin: checkin,
        activePlan: active,
        actionId: dietAction,
        validationMode: 'nutrition_focus',
        coachInstructions: person.pain,
      })
      const nutrition = generatedDietFormData(dietResult.generatedPlan, account.userId).nutrition_plan ?? ''
      console.log('  workout…')
      const workoutResult = await generatePlan({
        profile: onboarding,
        latestCheckin: checkin,
        activePlan: active,
        updatedDietPlan: stubPlan(account.userId, nutrition, ''),
        actionId: workoutAction,
        validationMode: 'workout_focus',
        coachInstructions: person.pain,
      })
      const workout = generatedWorkoutFormData(workoutResult.generatedPlan, account.userId).workout_plan ?? ''
      const checks = [...scoreDiet(nutrition, onboarding, person), ...scoreWorkout(workout, person)]
      for (const item of checks) {
        console.log(`  ${item.ok ? 'PASS' : 'FAIL'} ${item.name} — ${item.detail}`)
        if (!item.ok) failures += 1
      }
      report.push({ id: person.id, mode: person.mode, promptDiet: dietResult.promptVersion, promptWorkout: workoutResult.promptVersion, checks, nutrition, workout })
    } catch (error) {
      failures += 1
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  FAIL generation — ${message.slice(0, 500)}`)
      report.push({ id: person.id, mode: person.mode, error: message })
    } finally {
      await cleanup(account.userId, account.email)
    }
  }
  const reportPath = join(tmpdir(), 'lurvox-smoke-10-plan-writing.json')
  writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), failures, report }, null, 2))
  console.log(`\nFailures: ${failures}`)
  console.log(`Report: ${reportPath}`)
  if (failures > 0) process.exit(1)
  console.log(selected.length === PEOPLE.length ? 'All 10 clients passed' : `All ${selected.length} selected clients passed`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
