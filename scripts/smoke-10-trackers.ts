/**
 * Create 10 trial clients, generate real diet + workout plans, and score whether
 * the daily tracker can parse them into usable meals/workouts.
 *
 * Run:
 *   npx tsx --env-file=.env.local.txt scripts/smoke-10-trackers.ts
 *   npx tsx --env-file=.env.local.txt scripts/smoke-10-trackers.ts --cleanup
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  createFakeTrialClient,
  listCoachesForAssignment,
} from '../src/lib/admin/testing-accounts'
import { generatePlan } from '../src/lib/ai/generate-plan'
import { generatedDietFormData, generatedWorkoutFormData } from '../src/lib/ai/plan-format'
import {
  buildTrackerSnapshot,
  isCoachingExerciseName,
} from '../src/lib/daily-tracker/parser'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { OnboardingProfile, Plan } from '../src/types/database'
import { finalSmokeScenarios, type LifestyleScenario } from './lifestyle-smoke-scenarios'

process.env.AI_PLAN_PROVIDER = process.env.AI_PLAN_PROVIDER || 'claude'

type Check = { name: string; ok: boolean; detail: string }
type ClientResult = {
  index: number
  scenarioId: string
  clientId: string
  email: string
  name: string
  dietDays: number
  mealCount: number
  workoutDays: number
  trainingSessions: number
  exerciseCount: number
  checks: Check[]
  passed: number
  failed: number
  error?: string
}

function reportPath(): string {
  const custom = process.argv.find((a) => a.startsWith('--report='))
  if (custom) return join(process.cwd(), custom.slice('--report='.length))
  return join(process.cwd(), 'tmp-lifestyle-10-tracker-report.json')
}

function argValue(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
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

function asPlan(clientId: string, coachId: string | null, nutrition: string, workout: string): Plan {
  const now = new Date().toISOString()
  return {
    id: `smoke-${clientId}`,
    client_id: clientId,
    coach_id: coachId ?? '',
    title: 'Tracker smoke plan',
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

function scoreTracker(
  profile: OnboardingProfile,
  scenario: LifestyleScenario,
  snap: ReturnType<typeof buildTrackerSnapshot>
): Check[] {
  const checks: Check[] = []
  const meals = snap.items.filter((i) => i.type === 'meal')
  const workouts = snap.items.filter((i) => i.type === 'workout')
  const training = workouts.filter((w) => w.type === 'workout' && w.exercises.length > 0)
  const rest = workouts.filter((w) => w.type === 'workout' && /rest/i.test(w.focus ?? w.title))
  const exercises = training.flatMap((w) => (w.type === 'workout' ? w.exercises : []))
  const dietDays = snap.dietDays?.length ?? 0
  const workoutDays = snap.workoutDays?.length ?? 0

  checks.push({
    name: 'Diet days in tracker picker',
    ok: dietDays >= 7,
    detail: `${dietDays} diet days`,
  })

  const mealsPerDay = new Map<string, number>()
  for (const m of meals) {
    if (m.type !== 'meal') continue
    const key = m.dietDay ?? 'default'
    mealsPerDay.set(key, (mealsPerDay.get(key) ?? 0) + 1)
  }
  const thinDays = [...mealsPerDay.entries()].filter(([, n]) => n < 2)
  checks.push({
    name: 'Meals parsed per diet day',
    ok: meals.length >= 14 && thinDays.length === 0,
    detail: `${meals.length} meals across ${mealsPerDay.size} days${thinDays.length ? `; thin: ${thinDays.map(([k, n]) => `${k}=${n}`).join(', ')}` : ''}`,
  })

  const emptyFoods = meals.filter((m) => m.type === 'meal' && !m.foods.trim())
  checks.push({
    name: 'Meal foods are not empty',
    ok: emptyFoods.length === 0,
    detail: emptyFoods.length ? `${emptyFoods.length} empty meals` : 'ok',
  })

  checks.push({
    name: 'Workout days in tracker picker',
    ok: workoutDays >= 4,
    detail: `${workoutDays} workout days, ${training.length} sessions, ${rest.length} rest`,
  })

  const skinny = training.filter((w) => w.type === 'workout' && w.exercises.length < 4)
  checks.push({
    name: 'Training days have enough exercises',
    ok: training.length >= 3 && skinny.length === 0,
    detail:
      skinny.length > 0
        ? skinny.map((w) => `${w.type === 'workout' ? w.dayLabel ?? w.title : ''}:${w.type === 'workout' ? w.exercises.length : 0}`).join('; ')
        : `${training.length} sessions, ${exercises.length} exercises`,
  })

  const coachingNames = exercises.filter((e) => isCoachingExerciseName(e.name))
  checks.push({
    name: 'Exercise names are real lifts',
    ok: coachingNames.length === 0,
    detail: coachingNames.length ? coachingNames.map((e) => e.name).slice(0, 5).join(', ') : 'ok',
  })

  const water = snap.items.find((i) => i.type === 'water')
  checks.push({
    name: 'Water tracker present',
    ok: Boolean(water && water.type === 'water' && water.targetMl > 0),
    detail: water && water.type === 'water' ? `${water.targetMl} ml` : 'missing',
  })

  checks.push({
    name: 'Sleep tracker present',
    ok: snap.items.some((i) => i.type === 'sleep'),
    detail: snap.items.some((i) => i.type === 'sleep') ? 'ok' : 'missing',
  })

  if (scenario.skipBreakfast) {
    const breakfasts = meals.filter((m) => m.type === 'meal' && /breakfast/i.test(m.title)).length
    checks.push({
      name: 'Skip-breakfast did not fill every day with breakfast',
      ok: breakfasts <= 3,
      detail: `breakfast meals=${breakfasts}`,
    })
  }

  if (scenario.skipLunch) {
    const lunches = meals.filter((m) => m.type === 'meal' && /lunch/i.test(m.title)).length
    checks.push({
      name: 'Skip-lunch did not fill every day with lunch',
      ok: lunches <= 4,
      detail: `lunch meals=${lunches}`,
    })
  }

  const snackHit = meals.some((m) => m.type === 'meal' && /snack/i.test(m.title))
  if (scenario.requireSnack || profile.onboarding_data?.eatingPattern?.snacks) {
    checks.push({
      name: 'Snack slot parsed into tracker',
      ok: snackHit,
      detail: snackHit ? 'snack meals present' : 'no snack meals',
    })
  }

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

  const onlyId = argValue('only', '').trim()
  const scenarios = finalSmokeScenarios()
    .filter((s) => !onlyId || s.id === onlyId)
    .slice(0, Math.max(1, Number(argValue('count', '10')) || 10))
  const concurrency = Math.max(1, Number(argValue('concurrency', '2')) || 2)
  const path = reportPath()

  console.log(`=== Tracker smoke: ${scenarios.length} clients, concurrency=${concurrency} ===\n`)

  const coaches = await listCoachesForAssignment()
  const coachId = coaches[0]?.id ?? null
  const admin = createAdminClient()
  const created: Array<{ clientId: string; email: string; scenario: LifestyleScenario }> = []

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!
    const account = await createFakeTrialClient(coachId, scenario.form)
    created.push({ clientId: account.userId, email: account.email, scenario })
    console.log(`Created ${i + 1}/${scenarios.length}: ${account.email} [${scenario.id}]`)
  }

  const results = await mapPool(created, concurrency, async (c, index) => {
    const label = `#${index + 1} ${c.scenario.id}`
    console.log(`\nGenerating diet+workout for ${label}…`)
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', c.clientId).single()
    if (error || !profile) {
      return {
        index: index + 1,
        scenarioId: c.scenario.id,
        clientId: c.clientId,
        email: c.email,
        name: c.scenario.form.name,
        dietDays: 0,
        mealCount: 0,
        workoutDays: 0,
        trainingSessions: 0,
        exerciseCount: 0,
        checks: [],
        passed: 0,
        failed: 1,
        error: error?.message ?? 'profile missing',
      } satisfies ClientResult
    }
    const onboarding = profile as OnboardingProfile

    try {
      const dietResult = await generatePlan({
        profile: onboarding,
        actionId: 'initial_diet',
        validationMode: 'nutrition_focus',
        coachInstructions:
          'Generate a personalized diet plan. Obey diet preference and lifestyle. Never invent a random chart.',
      })
      const dietForm = generatedDietFormData(dietResult.generatedPlan, c.clientId)

      const workoutResult = await generatePlan({
        profile: onboarding,
        actionId: 'initial_workout',
        validationMode: 'workout_focus',
        coachInstructions:
          'Generate a personalized workout plan. Label each training day. Real exercise names with sets and reps.',
      })
      const workoutForm = generatedWorkoutFormData(workoutResult.generatedPlan, c.clientId)

      const nutrition = dietForm.nutrition_plan ?? ''
      const workout = workoutForm.workout_plan ?? ''

      await admin.from('plans').insert({
        client_id: c.clientId,
        coach_id: coachId,
        title: `Tracker smoke ${index + 1} — ${c.scenario.id}`,
        nutrition_plan: nutrition,
        workout_plan: workout,
        cardio_plan: workoutForm.cardio_plan || dietForm.cardio_plan || '',
        supplement_plan: dietForm.supplement_plan || '',
        coach_notes: [dietForm.coach_notes, workoutForm.coach_notes].filter(Boolean).join('\n'),
        version: 1,
        active: true,
      })

      const plan = asPlan(c.clientId, coachId, nutrition, workout)
      const snap = buildTrackerSnapshot(plan, onboarding)
      const checks = scoreTracker(onboarding, c.scenario, snap)
      const passed = checks.filter((x) => x.ok).length
      const failed = checks.filter((x) => !x.ok).length
      const meals = snap.items.filter((i) => i.type === 'meal')
      const workouts = snap.items.filter((i) => i.type === 'workout')
      const training = workouts.filter((w) => w.type === 'workout' && w.exercises.length > 0)
      const exercises = training.flatMap((w) => (w.type === 'workout' ? w.exercises : []))
      console.log(`  ${label}: ${passed}/${checks.length} tracker checks passed`)

      return {
        index: index + 1,
        scenarioId: c.scenario.id,
        clientId: c.clientId,
        email: c.email,
        name: onboarding.name ?? c.scenario.form.name,
        dietDays: snap.dietDays?.length ?? 0,
        mealCount: meals.length,
        workoutDays: snap.workoutDays?.length ?? 0,
        trainingSessions: training.length,
        exerciseCount: exercises.length,
        checks,
        passed,
        failed,
      } satisfies ClientResult
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ${label} FAILED: ${message}`)
      return {
        index: index + 1,
        scenarioId: c.scenario.id,
        clientId: c.clientId,
        email: c.email,
        name: onboarding.name ?? c.scenario.form.name,
        dietDays: 0,
        mealCount: 0,
        workoutDays: 0,
        trainingSessions: 0,
        exerciseCount: 0,
        checks: [],
        passed: 0,
        failed: 1,
        error: message,
      } satisfies ClientResult
    }
  })

  const failByCheck: Record<string, number> = {}
  for (const r of results) {
    for (const c of r.checks.filter((x) => !x.ok)) {
      failByCheck[c.name] = (failByCheck[c.name] ?? 0) + 1
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    count: results.length,
    concurrency,
    clients: results,
    summary: {
      clients: results.length,
      generationErrors: results.filter((r) => r.error).length,
      clientsFullyPassing: results.filter((r) => !r.error && r.failed === 0 && r.checks.length > 0).length,
      correctPercent: Math.round(
        (results.filter((r) => !r.error && r.failed === 0 && r.checks.length > 0).length /
          Math.max(1, results.length)) *
          100
      ),
      failByCheck,
    },
  }
  writeFileSync(path, JSON.stringify(report, null, 2))

  console.log('\n=== TRACKER SUMMARY ===')
  console.log(`Clients fully passing: ${report.summary.clientsFullyPassing}/${report.summary.clients} (${report.summary.correctPercent}%)`)
  console.log(`Generation errors: ${report.summary.generationErrors}`)
  console.log(`Report: ${path}`)
  if (Object.keys(failByCheck).length) {
    console.log('\nBroken tracker checks:')
    for (const [name, n] of Object.entries(failByCheck).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}× ${name}`)
    }
  }
  for (const r of results) {
    const status = r.error ? 'ERROR' : r.failed === 0 ? 'PASS' : 'PARTIAL'
    console.log(
      `\n${status} #${r.index} ${r.scenarioId} — dietDays=${r.dietDays} meals=${r.mealCount} workoutDays=${r.workoutDays} exercises=${r.exerciseCount}`
    )
    if (r.error) console.log(`  error: ${r.error}`)
    for (const c of r.checks.filter((x) => !x.ok)) {
      console.log(`  FAIL ${c.name}: ${c.detail}`)
    }
  }

  process.exit(report.summary.clientsFullyPassing === report.summary.clients ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
