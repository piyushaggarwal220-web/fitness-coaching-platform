/**
 * Detailed diet + workout smoke for three different people.
 *
 *   npx tsx --env-file=.env.local scripts/smoke-3-diet-workout.ts
 *
 * Trial clients are deleted at the end. The report keeps the plans.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeTrialClient } from '../src/lib/admin/testing-accounts'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { generatedDietFormData, generatedWorkoutFormData } from '../src/lib/ai/plan-format'
import { resolveClientCalorieTargets } from '../src/lib/ai/calorie-targets'
import {
  alignDietShownTotals,
  dietTextHasCalorieConflict,
  inferMacrosFromDietText,
  parseHeaderCalories,
} from '../src/lib/ai/nutrition-macro-sync'
import { formatTrainingChoiceNote } from '../src/lib/ai/workout-split'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { Checkin, OnboardingFormData, OnboardingProfile } from '../src/types/database'

process.env.AI_PLAN_PROVIDER = process.env.AI_PLAN_PROVIDER || 'openai'

type Person = {
  id: string
  form: Partial<OnboardingFormData> & { name: string }
  split: string
  difficulty: string
  expect: {
    place: 'home' | 'gym'
    split: 'full_body' | 'ppl' | 'upper_lower'
    minMainSets: number
    maxLightShare: number
  }
}

const PEOPLE: Person[] = [
  {
    id: 'beginner-home',
    form: {
      name: 'Aisha Home',
      gender: 'female',
      age: '28',
      weight: '68',
      height: '162',
      fitness_goal: 'fat_loss',
      occupation: 'desk_job',
      activity_level: 'sedentary',
      training_location: 'home',
      training_experience: 'beginner',
      training_days_per_week: '3',
      training_available_days: ['monday', 'wednesday', 'friday'],
      workout_duration: '45',
      workout_split_preference: 'full_body',
      equipment_available: ['dumbbells', 'resistance bands', 'yoga mat'],
      gym_stations: [],
      diet_preference: 'vegetarian',
      favorite_foods: 'dal, roti, paneer, curd, rice',
      foods_disliked: 'mushroom, bitter gourd',
      breakfast: 'poha and chai',
      lunch: 'dal rice and salad',
      dinner: 'roti, paneer, curd',
    },
    split: 'full_body',
    difficulty: 'moderate',
    expect: { place: 'home', split: 'full_body', minMainSets: 3, maxLightShare: 0.35 },
  },
  {
    id: 'intermediate-gym-hard',
    form: {
      name: 'Rohit Gym',
      gender: 'male',
      age: '31',
      weight: '82',
      height: '178',
      fitness_goal: 'muscle_gain',
      occupation: 'desk_job',
      activity_level: 'moderately_active',
      training_location: 'gym',
      training_experience: 'intermediate',
      training_days_per_week: '6',
      training_available_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      workout_duration: '75',
      workout_split_preference: 'ppl',
      recent_program: 'Push pull legs for a year, comfortable with barbell compounds',
      diet_preference: 'non_veg',
      chicken_days: '4',
      chicken_allowed_days: ['monday', 'tuesday', 'thursday', 'friday'],
      favorite_foods: 'chicken, rice, eggs, roti, curd',
      breakfast: 'eggs and oats',
      lunch: 'chicken rice',
      dinner: 'roti, chicken, salad',
    },
    split: 'ppl',
    difficulty: 'hard',
    expect: { place: 'gym', split: 'ppl', minMainSets: 4, maxLightShare: 0.25 },
  },
  {
    id: 'advanced-both-keep',
    form: {
      name: 'Neha Both',
      gender: 'female',
      age: '36',
      weight: '74',
      height: '168',
      fitness_goal: 'body_recomposition',
      occupation: 'desk_job',
      activity_level: 'lightly_active',
      training_location: 'both',
      training_experience: 'advanced',
      training_days_per_week: '4',
      training_available_days: ['monday', 'tuesday', 'thursday', 'friday'],
      workout_duration: '60',
      workout_split_preference: 'upper_lower',
      recent_program: 'Upper lower in a commercial gym for 4 years',
      diet_preference: 'eggetarian',
      egg_days: '7',
      egg_allowed_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      favorite_foods: 'eggs, oats, paneer, rice, dal',
      breakfast: 'eggs and oats',
      lunch: 'dal rice',
      dinner: 'paneer and roti',
    },
    split: 'upper_lower',
    difficulty: 'keep',
    expect: { place: 'gym', split: 'upper_lower', minMainSets: 4, maxLightShare: 0.25 },
  },
]

type Check = { name: string; ok: boolean; detail: string }

function checkinFor(person: Person, clientId: string): Checkin {
  return {
    id: `smoke-${person.id}`,
    client_id: clientId,
    coach_id: null,
    checkin_type: 'weekly',
    coaching_week: 1,
    workout_split_preference: person.split,
    workout_difficulty: person.difficulty,
    diet_adherence: 7,
    workout_adherence: 7,
    days_followed_diet: 5,
    days_followed_workout: 4,
    energy_level: 7,
    sleep_quality: 7,
    stress_level: 4,
    hunger_level: 5,
    motivation_level: 7,
    progress_rating: 6,
    weight: Number(person.form.weight),
    notes: null,
    pain_injuries: null,
  } as Checkin
}

function headerProtein(text: string): number | null {
  const match = text.match(/protein:\s*(\d+)/i)
  return match ? parseInt(match[1]!, 10) : null
}

function setCounts(text: string): number[] {
  const counts: number[] = []
  for (const line of text.split(/\n/)) {
    if (/very light|groove|warm-?up|stretch|circles|easy marching|easy walking/i.test(line)) continue
    const match = line.match(/(\d+)\s+sets?\s*[x×]/i) ?? line.match(/(\d+)\s*[x×]\s*\d+/)
    if (!match) continue
    const sets = parseInt(match[1]!, 10)
    if (sets >= 1 && sets <= 8) counts.push(sets)
  }
  return counts
}

function scoreDiet(nutrition: string, profile: OnboardingProfile): Check[] {
  const inferred = inferMacrosFromDietText(nutrition)
  const aligned = inferMacrosFromDietText(alignDietShownTotals(nutrition))
  const header = parseHeaderCalories(nutrition)
  const protein = headerProtein(nutrition)
  const targets = resolveClientCalorieTargets(profile)
  const preferred = targets?.preferred ?? null
  const checks: Check[] = [
    {
      name: 'Shown calories match the meals',
      ok: Boolean(inferred && aligned && inferred.calories === aligned.calories && !dietTextHasCalorieConflict(nutrition)),
      detail: `header ${header ?? '—'} food ${inferred?.calories ?? '—'} aligned ${aligned?.calories ?? '—'}`,
    },
    {
      name: 'Shown protein matches the meals',
      ok: Boolean(
        inferred &&
          aligned &&
          inferred.protein === aligned.protein &&
          protein != null &&
          Math.abs(protein - inferred.protein) <= 8
      ),
      detail: `header ${protein ?? '—'}g food ${inferred?.protein ?? '—'}g`,
    },
  ]
  if (preferred != null && inferred) {
    const delta = inferred.calories - preferred
    checks.push({
      name: 'Calories sit on the client target',
      ok: delta <= 150 && delta >= -100,
      detail: `food ${inferred.calories} vs target ${preferred} (${delta >= 0 ? '+' : ''}${delta})`,
    })
  }
  return checks
}

function scoreWorkout(workout: string, person: Person): Check[] {
  const sets = setCounts(workout)
  const light = sets.filter((n) => n <= 2).length
  const lightShare = sets.length ? light / sets.length : 1
  const maxSets = sets.length ? Math.max(...sets) : 0
  const homeKit = /\b(barbell|smith|leg press|lat pulldown|cable|hack squat)\b/i.test(workout)
  const homeDay = /\b(home workout|home session|at home|home day)\b/i.test(workout)
  const gymDay = /\b(gym day|at the gym)\b/i.test(workout)
  const splitOk =
    person.expect.split === 'ppl'
      ? /\bpush\b/i.test(workout) && /\bpull\b/i.test(workout) && /\bleg/i.test(workout)
      : person.expect.split === 'upper_lower'
        ? /\bupper\b/i.test(workout) && /\blower\b/i.test(workout)
        : /full[\s-]?body/i.test(workout)
  const placeOk = person.expect.place === 'home' ? !homeKit : !homeDay
  const mixOk = !(homeDay && (gymDay || homeKit || person.expect.place === 'gym'))
  return [
    {
      name: 'One place, not a mix',
      ok: placeOk && mixOk,
      detail: person.expect.place === 'home' ? (homeKit ? 'gym equipment in a home plan' : 'home only') : homeDay ? 'home day inside the week' : 'gym only',
    },
    {
      name: 'Split matches the choice',
      ok: splitOk,
      detail: person.expect.split,
    },
    {
      name: 'Sets match the person',
      ok: sets.length >= 6 && maxSets >= person.expect.minMainSets && lightShare <= person.expect.maxLightShare,
      detail: `${sets.length} set lines, max ${maxSets}, light share ${Math.round(lightShare * 100)}% (need max ≥ ${person.expect.minMainSets})`,
    },
  ]
}

async function cleanup(clientId: string, email: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('plans').delete().eq('client_id', clientId)
  await admin.from('profiles').delete().eq('id', clientId)
  await admin.auth.admin.deleteUser(clientId)
  console.log(`Deleted trial ${email}`)
}

function rescoreSaved(): void {
  const { readFileSync } = require('node:fs') as typeof import('node:fs')
  const saved = JSON.parse(readFileSync(join(process.cwd(), 'tmp-smoke-3-diet-workout.json'), 'utf8')) as {
    report: Array<{ id: string; workout: string; checks: Check[] }>
  }
  let failures = 0
  for (const row of saved.report) {
    const person = PEOPLE.find((item) => item.id === row.id)
    if (!person) continue
    const workoutChecks = scoreWorkout(row.workout, person)
    const dietChecks = row.checks.filter((item) => item.name.startsWith('Shown') || item.name.startsWith('Calories'))
    for (const item of [...dietChecks, ...workoutChecks]) {
      console.log(`${item.ok ? 'PASS' : 'FAIL'} ${row.id} — ${item.name} — ${item.detail}`)
      if (!item.ok) failures += 1
    }
  }
  if (failures > 0) process.exit(1)
  console.log('Rescore passed')
}

async function main(): Promise<void> {
  if (process.argv.includes('--rescore')) {
    rescoreSaved()
    return
  }
  const report: Array<Record<string, unknown>> = []
  let failures = 0

  for (const person of PEOPLE) {
    console.log(`\n=== ${person.id} (${person.form.name}) ===`)
    const account = await createFakeTrialClient(null, person.form)
    try {
      const admin = createAdminClient()
      const { data: profile, error } = await admin.from('profiles').select('*').eq('id', account.userId).single()
      if (error || !profile) throw new Error(error?.message ?? 'profile missing')
      const onboarding = profile as OnboardingProfile
      const checkin = checkinFor(person, account.userId)
      const note = formatTrainingChoiceNote(person.split, person.difficulty)

      console.log('  diet…')
      const dietResult = await generatePlan({
        profile: onboarding,
        latestCheckin: checkin,
        actionId: 'review_update_diet',
        validationMode: 'nutrition_focus',
        coachInstructions: `${note}\nBuild the diet from this person's meals and target. The calorie and protein lines must match the meals.`,
      })
      const nutrition = generatedDietFormData(dietResult.generatedPlan, account.userId).nutrition_plan ?? ''

      console.log('  workout…')
      const workoutResult = await generatePlan({
        profile: onboarding,
        latestCheckin: checkin,
        actionId: 'review_update_workout',
        validationMode: 'workout_focus',
        updatedDietPlan: {
          id: 'smoke',
          client_id: account.userId,
          coach_id: '',
          title: 'Smoke',
          phase: null,
          nutrition_plan: nutrition,
          workout_plan: null,
          cardio_plan: null,
          supplement_plan: null,
          coach_notes: null,
          version: 1,
          active: false,
          delivered_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        coachInstructions: `${note}\nWrite the week for this person. Do not make it light if they are experienced or asked for hard. Do not mix gym and home.`,
      })
      const workout = generatedWorkoutFormData(workoutResult.generatedPlan, account.userId).workout_plan ?? ''
      const checks = [...scoreDiet(nutrition, onboarding), ...scoreWorkout(workout, person)]
      for (const item of checks) {
        console.log(`  ${item.ok ? 'PASS' : 'FAIL'} ${item.name} — ${item.detail}`)
        if (!item.ok) failures += 1
      }
      report.push({
        id: person.id,
        email: account.email,
        experience: person.form.training_experience,
        location: person.form.training_location,
        difficulty: person.difficulty,
        split: person.split,
        checks,
        nutrition,
        workout,
      })
    } finally {
      await cleanup(account.userId, account.email)
    }
  }

  const reportPath = join(process.cwd(), 'tmp-smoke-3-diet-workout.json')
  writeFileSync(reportPath, JSON.stringify({ createdAt: new Date().toISOString(), failures, report }, null, 2))
  console.log(`\nReport: ${reportPath}`)
  if (failures > 0) {
    console.error(`${failures} checks failed`)
    process.exit(1)
  }
  console.log('All 3 clients passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
