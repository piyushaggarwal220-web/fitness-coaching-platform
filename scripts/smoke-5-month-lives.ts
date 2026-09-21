/**
 * Five trial clients, five different lives, one month of plans + tracker checks.
 *
 * Models (Astra is disabled):
 *   Week 0 create  → gpt-5.6-terra
 *   Weeks 1–4 maintain → gpt-5.6-luna
 *
 *   npx tsx --env-file=.env.local.txt scripts/smoke-5-month-lives.ts
 *   npx tsx --env-file=.env.local.txt scripts/smoke-5-month-lives.ts --cleanup
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createFakeTrialClient,
  listCoachesForAssignment,
} from '../src/lib/admin/testing-accounts'
import { coachAcceptsAutoAssignment } from '../src/lib/coach-delivery-policy'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { generatedDietFormData, generatedWorkoutFormData } from '../src/lib/ai/plan-format'
import { buildTrackerSnapshot, isCoachingExerciseName } from '../src/lib/daily-tracker/parser'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { Checkin, OnboardingProfile, Plan } from '../src/types/database'
import { LIFESTYLE_SCENARIOS, type LifestyleScenario } from './lifestyle-smoke-scenarios'

process.env.AI_PLAN_PROVIDER = 'openai'
delete process.env.OPENAI_MODEL_ASTRA
delete process.env.OPENAI_ALLOW_ASTRA

const SCENARIO_IDS = [
  'office-canteen-veg',
  'hostel-mess-vegan',
  'eggs-mwf-only',
  'gluten-sensitive',
  'labour-physical-job',
] as const

const WEEKS: Array<{
  week: number
  action: 'create' | 'maintain'
  title: string
  notes: string
  energy: number
  hunger: number
  training: number
  adherence: number
}> = [
  {
    week: 0,
    action: 'create',
    title: 'onboarding',
    notes: 'Just started. Follow my real meals, timings, and training setup.',
    energy: 3,
    hunger: 3,
    training: 3,
    adherence: 8,
  },
  {
    week: 1,
    action: 'maintain',
    title: 'solid week',
    notes: 'Hit most meals and training. Slightly hungry at night. Keep the same foods, small tweaks only.',
    energy: 4,
    hunger: 4,
    training: 4,
    adherence: 8,
  },
  {
    week: 2,
    action: 'maintain',
    title: 'messy travel week',
    notes: 'Travel and irregular hours. Skipped two workouts. Ate outside a lot. Need a simpler week I can actually follow.',
    energy: 2,
    hunger: 3,
    training: 2,
    adherence: 4,
  },
  {
    week: 3,
    action: 'maintain',
    title: 'back on track',
    notes: 'Back home. Want more protein in meals I already eat. Do not invent a new cuisine.',
    energy: 4,
    hunger: 3,
    training: 4,
    adherence: 7,
  },
  {
    week: 4,
    action: 'maintain',
    title: 'tired month-end',
    notes: 'Sleeping 5–6 hours, low energy. Easier workouts this week. Keep diet close to last week.',
    energy: 2,
    hunger: 2,
    training: 2,
    adherence: 6,
  },
]

type Check = { name: string; ok: boolean; detail: string }
type WeekResult = {
  week: number
  title: string
  dietModel: string
  workoutModel: string
  dietDays: number
  mealCount: number
  workoutDays: number
  exerciseCount: number
  checks: Check[]
  passed: number
  failed: number
  error?: string
}

function reportPath(): string {
  const custom = process.argv.find((a) => a.startsWith('--report='))
  if (custom) return join(process.cwd(), custom.slice('--report='.length))
  return join(process.cwd(), 'tmp-smoke-5-month-lives.json')
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function argValue(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

function asPlan(clientId: string, nutrition: string, workout: string): Plan {
  const now = new Date().toISOString()
  return {
    id: `smoke-month-${clientId}`,
    client_id: clientId,
    coach_id: '',
    title: 'Month smoke plan',
    phase: 'Phase 1',
    nutrition_plan: nutrition,
    workout_plan: workout,
    cardio_plan: '',
    supplement_plan: '',
    coach_notes: 'Drink 3L water. Bed by 10:30 PM.',
    version: 1,
    active: true,
    delivered_at: now,
    updated_at: now,
    created_at: now,
  }
}

function fakeCheckin(clientId: string, week: (typeof WEEKS)[number], startWeight: number): Checkin {
  const submitted = new Date(Date.now() - (4 - week.week) * 7 * 86400000).toISOString()
  return {
    id: `smoke-checkin-${clientId}-w${week.week}`,
    client_id: clientId,
    coach_id: '',
    submitted_at: submitted,
    checkin_type: 'weekly',
    coaching_week: week.week,
    coaching_day: null,
    due_date: null,
    due_at: null,
    weight: startWeight - week.week * 0.3,
    waist: null,
    chest: null,
    thigh: null,
    navel: null,
    progress_photo_front: null,
    progress_photo_side: null,
    progress_photo_back: null,
    energy_level: week.energy,
    hunger_level: week.hunger,
    training_performance: week.training,
    adherence_score: week.adherence,
    diet_adherence: week.adherence,
    workout_adherence: week.training * 2,
    days_followed_diet: Math.max(3, Math.round(week.adherence / 1.5)),
    days_followed_workout: week.training,
    days_followed_sleep: week.energy + 2,
    days_followed_water: 5,
    days_followed_steps: 4,
    sleep_quality: week.energy,
    stress_level: week.week === 2 ? 4 : 2,
    motivation_level: week.adherence > 6 ? 4 : 2,
    digestion: 'ok',
    pain_injuries: week.week === 4 ? 'knees a bit sore from sleep debt' : null,
    questions_for_coach: week.notes,
    cardio_completed: week.week === 2 ? 'no' : 'yes',
    progress_rating: week.adherence > 6 ? 4 : 2,
    progress_notes: week.notes,
    adherence_wins: week.week === 1 ? 'Logged most meals' : null,
    adherence_struggles: week.week === 2 ? 'Travel and skipped training' : null,
    extra_photos: null,
    plan_version: week.week,
    notes: week.notes,
    coach_response: null,
    reviewed: false,
    reviewed_at: null,
    auto_reply_at: null,
    auto_replied_at: null,
  }
}

function assertAllowedModel(model: string, expected: 'terra' | 'luna'): Check {
  const got = model.toLowerCase()
  const ok = expected === 'terra' ? got.includes('terra') : got.includes('luna')
  return {
    name: `Model is ${expected} (not Astra)`,
    ok: ok && !got.includes('astra'),
    detail: model,
  }
}

function scoreWeek(
  profile: OnboardingProfile,
  scenario: LifestyleScenario,
  nutrition: string,
  workout: string,
  dietModel: string,
  workoutModel: string,
  expected: 'terra' | 'luna'
): Check[] {
  const checks: Check[] = [
    assertAllowedModel(dietModel, expected),
    assertAllowedModel(workoutModel, expected),
  ]
  const plan = asPlan(profile.id, nutrition, workout)
  const snap = buildTrackerSnapshot(plan, profile)
  const meals = snap.items.filter((i) => i.type === 'meal')
  const workouts = snap.items.filter((i) => i.type === 'workout')
  const training = workouts.filter((w) => w.type === 'workout' && w.exercises.length > 0)
  const exercises = training.flatMap((w) => (w.type === 'workout' ? w.exercises : []))
  const dietDays = snap.dietDays?.length ?? 0

  checks.push({
    name: 'Diet days in tracker',
    ok: dietDays >= 7,
    detail: `${dietDays} diet days`,
  })
  checks.push({
    name: 'Meals parsed',
    ok: meals.length >= 7 && dietDays >= 7,
    detail: `${meals.length} meal cards, ${dietDays} diet days`,
  })
  const emptyFoods = meals.filter((m) => m.type === 'meal' && !m.foods.trim())
  checks.push({
    name: 'Meal foods not empty',
    ok: emptyFoods.length === 0,
    detail: emptyFoods.length ? `${emptyFoods.length} empty` : 'ok',
  })
  checks.push({
    name: 'Training sessions parsed',
    ok: training.length >= 3,
    detail: `${training.length} sessions, ${exercises.length} exercises`,
  })
  const coachingNames = exercises.filter((e) => isCoachingExerciseName(e.name))
  checks.push({
    name: 'Exercise names are real lifts',
    ok: coachingNames.length === 0,
    detail: coachingNames.length ? coachingNames.map((e) => e.name).slice(0, 4).join(', ') : 'ok',
  })
  checks.push({
    name: 'Water tracker',
    ok: snap.items.some((i) => i.type === 'water'),
    detail: snap.items.some((i) => i.type === 'water') ? 'ok' : 'missing',
  })
  checks.push({
    name: 'Sleep tracker',
    ok: snap.items.some((i) => i.type === 'sleep'),
    detail: snap.items.some((i) => i.type === 'sleep') ? 'ok' : 'missing',
  })

  const hay = `${nutrition}\n${workout}`.toLowerCase()
  const missing = scenario.mustInclude.filter((food) => !hay.includes(food.toLowerCase()))
  checks.push({
    name: 'Lifestyle foods still present',
    ok: missing.length <= Math.max(1, Math.floor(scenario.mustInclude.length / 3)),
    detail: missing.length ? `missing ${missing.slice(0, 6).join(', ')}` : 'ok',
  })
  const banned = scenario.mustExclude.filter((food) => new RegExp(`\\b${food.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay))
  checks.push({
    name: 'Banned lifestyle foods absent',
    ok: banned.length === 0,
    detail: banned.length ? banned.slice(0, 6).join(', ') : 'ok',
  })

  return checks
}

async function cleanupFromReport(): Promise<void> {
  const path = reportPath()
  if (!existsSync(path)) {
    console.error('No report file found at', path)
    process.exit(1)
  }
  const report = JSON.parse(readFileSync(path, 'utf8')) as {
    clients: Array<{ clientId: string; email: string }>
  }
  const admin = createAdminClient()
  let deleted = 0
  for (const c of report.clients ?? []) {
    try {
      await admin.from('daily_tracker_days').delete().eq('client_id', c.clientId)
      await admin.from('plans').delete().eq('client_id', c.clientId)
      await admin.from('checkins').delete().eq('client_id', c.clientId)
      await admin.from('profiles').delete().eq('id', c.clientId)
      await admin.auth.admin.deleteUser(c.clientId)
      deleted += 1
      console.log(`Deleted ${c.email}`)
    } catch (err) {
      console.error(`Failed delete ${c.email}`, err)
    }
  }
  console.log(`Cleanup done: ${deleted}/${report.clients?.length ?? 0}`)
}

async function main(): Promise<void> {
  if (hasFlag('cleanup')) {
    await cleanupFromReport()
    return
  }

  const scenarios = SCENARIO_IDS.map((id) => {
    const hit = LIFESTYLE_SCENARIOS.find((s) => s.id === id)
    if (!hit) throw new Error(`Unknown scenario ${id}`)
    return hit
  })
  const concurrency = Math.max(1, Number(argValue('concurrency', '2')) || 2)
  const path = reportPath()
  const admin = createAdminClient()
  const coaches = await listCoachesForAssignment()
  const planCoachId = coaches.find((c) => coachAcceptsAutoAssignment(c.id))?.id ?? null

  console.log('Models: create=gpt-5.6-terra  weekly=gpt-5.6-luna  astra=blocked')
  console.log(`=== Month lives: ${scenarios.length} clients, 5 weeks each, concurrency=${concurrency} ===\n`)

  const created: Array<{ clientId: string; email: string; scenario: LifestyleScenario }> = []
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!
    const account = await createFakeTrialClient(null, scenario.form)
    created.push({ clientId: account.userId, email: account.email, scenario })
    console.log(`Created ${i + 1}/${scenarios.length}: ${account.email} [${scenario.id}]`)
  }

  const results = await mapPool(created, concurrency, async (c, index) => {
    const label = `#${index + 1} ${c.scenario.id}`
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', c.clientId).single()
    if (error || !profile) {
      return {
        index: index + 1,
        scenarioId: c.scenario.id,
        clientId: c.clientId,
        email: c.email,
        name: c.scenario.form.name,
        weeks: [] as WeekResult[],
        error: error?.message ?? 'profile missing',
      }
    }
    const onboarding = profile as OnboardingProfile
    const startWeight = Number.parseFloat(String(onboarding.weight ?? '70')) || 70
    let nutrition = ''
    let workout = ''
    const weeks: WeekResult[] = []

    for (const week of WEEKS) {
      const expected = week.action === 'create' ? 'terra' : 'luna'
      const dietAction = week.action === 'create' ? 'initial_diet' : 'review_update_diet'
      const workoutAction = week.action === 'create' ? 'initial_workout' : 'review_update_workout'
      console.log(`\n${label} week ${week.week} (${week.title}) ${expected}…`)
      try {
        const checkin = week.week === 0 ? null : fakeCheckin(c.clientId, week, startWeight)
        const activePlan = nutrition || workout ? asPlan(c.clientId, nutrition, workout) : null
        const dietResult = await generatePlan({
          profile: onboarding,
          latestCheckin: checkin,
          activePlan,
          actionId: dietAction,
          validationMode: 'nutrition_focus',
          coachInstructions: week.notes,
        })
        const dietForm = generatedDietFormData(dietResult.generatedPlan, c.clientId)
        nutrition = dietForm.nutrition_plan ?? nutrition

        const workoutResult = await generatePlan({
          profile: onboarding,
          latestCheckin: checkin,
          activePlan: asPlan(c.clientId, nutrition, workout),
          updatedDietPlan: asPlan(c.clientId, nutrition, workout),
          actionId: workoutAction,
          validationMode: 'workout_focus',
          coachInstructions: week.notes,
        })
        const workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, c.clientId)
        workout = workoutForm.workout_plan ?? workout

        if (planCoachId) {
          await admin.from('plans').insert({
            client_id: c.clientId,
            coach_id: planCoachId,
            title: `${c.scenario.id} week ${week.week}`,
            nutrition_plan: nutrition,
            workout_plan: workout,
            version: week.week + 1,
            active: week.week === 4,
          })
        }

        const checks = scoreWeek(
          onboarding,
          c.scenario,
          nutrition,
          workout,
          dietResult.model,
          workoutResult.model,
          expected
        )
        const passed = checks.filter((x) => x.ok).length
        const failed = checks.filter((x) => !x.ok).length
        const snap = buildTrackerSnapshot(asPlan(c.clientId, nutrition, workout), onboarding)
        const meals = snap.items.filter((i) => i.type === 'meal')
        const training = snap.items.filter((i) => i.type === 'workout' && i.exercises.length > 0)
        const exercises = training.flatMap((w) => (w.type === 'workout' ? w.exercises : []))
        console.log(
          `  ${label} w${week.week}: diet=${dietResult.model} workout=${workoutResult.model} tracker ${passed}/${checks.length}`
        )
        weeks.push({
          week: week.week,
          title: week.title,
          dietModel: dietResult.model,
          workoutModel: workoutResult.model,
          dietDays: snap.dietDays?.length ?? 0,
          mealCount: meals.length,
          workoutDays: snap.workoutDays?.length ?? 0,
          exerciseCount: exercises.length,
          checks,
          passed,
          failed,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`  ${label} w${week.week} FAILED: ${message}`)
        weeks.push({
          week: week.week,
          title: week.title,
          dietModel: '',
          workoutModel: '',
          dietDays: 0,
          mealCount: 0,
          workoutDays: 0,
          exerciseCount: 0,
          checks: [],
          passed: 0,
          failed: 1,
          error: message,
        })
      }
    }

    return {
      index: index + 1,
      scenarioId: c.scenario.id,
      clientId: c.clientId,
      email: c.email,
      name: onboarding.name ?? c.scenario.form.name,
      weeks,
    }
  })

  const weekRows = results.flatMap((r) => r.weeks)
  const astraHits = weekRows.filter(
    (w) => /astra/i.test(w.dietModel) || /astra/i.test(w.workoutModel)
  )
  const report = {
    createdAt: new Date().toISOString(),
    models: { create: 'gpt-5.6-terra', weekly: 'gpt-5.6-luna', astra: 'blocked' },
    concurrency,
    clients: results,
    summary: {
      clients: results.length,
      weekSnapshots: weekRows.length,
      weekErrors: weekRows.filter((w) => w.error).length,
      weeksFullyPassing: weekRows.filter((w) => !w.error && w.failed === 0 && w.checks.length > 0)
        .length,
      astraCalls: astraHits.length,
    },
  }
  writeFileSync(path, JSON.stringify(report, null, 2))

  console.log('\n=== MONTH LIVES SUMMARY ===')
  console.log(`Models: Terra (create) / Luna (weeks 1–4) / Astra blocked`)
  console.log(
    `Weeks fully passing: ${report.summary.weeksFullyPassing}/${report.summary.weekSnapshots}`
  )
  console.log(`Week errors: ${report.summary.weekErrors}`)
  console.log(`Astra calls: ${report.summary.astraCalls}`)
  console.log(`Report: ${path}`)
  for (const r of results) {
    console.log(`\n${r.scenarioId} ${r.email}`)
    for (const w of r.weeks) {
      const status = w.error ? 'ERROR' : w.failed === 0 ? 'PASS' : 'PARTIAL'
      console.log(
        `  ${status} w${w.week} ${w.title} diet=${w.dietModel || '-'} workout=${w.workoutModel || '-'} meals=${w.mealCount} exercises=${w.exerciseCount}`
      )
      if (w.error) console.log(`    ${w.error}`)
      for (const c of w.checks.filter((x) => !x.ok)) {
        console.log(`    FAIL ${c.name}: ${c.detail}`)
      }
    }
  }

  process.exit(report.summary.astraCalls === 0 && report.summary.weekErrors === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
