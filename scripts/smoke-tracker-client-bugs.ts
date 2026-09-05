/**
 * Offline + live checks for the four client tracker bugs:
 * previous-week progress, cloned weekly diets, workout set typing, meal logging.
 *
 *   npx tsx scripts/smoke-tracker-client-bugs.ts
 *   npx tsx --env-file=.env.local.txt scripts/smoke-tracker-client-bugs.ts --live
 */
import { coachingDateKeyDaysAgo, getCoachingDateKey } from '../src/lib/checkin-schedule'
import {
  collectDietProse,
  dietFailsRequestedVariety,
  scoreDietDayVariety,
} from '../src/lib/ai/diet-day-variety'
import { parseOptionalNumber } from '../src/lib/daily-tracker/set-input'
import { buildTrackerSnapshot, mergeCompletion } from '../src/lib/daily-tracker/parser'
import { buildWeekProgress } from '../src/lib/daily-tracker/week-progress'
import type { Plan } from '../src/types/database'

let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    failed += 1
  } else {
    console.log(`PASS ${label}`)
  }
}

function clonedWeek(meal: string): string {
  return [1, 2, 3, 4, 5, 6, 7]
    .map((n, i) => {
      const day = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]
      return `Day ${n} (${day})\nBreakfast: ${meal}\nLunch: Dal and two rotis\nDinner: Khichdi\nDaily totals: ~1800 kcal`
    })
    .join('\n\n')
}

function variedWeek(): string {
  const breakfasts = ['Idli sambar', 'Poha peanuts', 'Upma', 'Thepla curd', 'Oats banana', 'Besan chilla', 'Curd rice']
  return breakfasts
    .map((b, i) => {
      const day = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]
      return `Day ${i + 1} (${day})\nBreakfast: ${b}\nLunch: Dal roti sabzi\nDinner: Paneer or khichdi\nDaily totals: ~1800 kcal`
    })
    .join('\n\n')
}

// --- 1. Previous week progress ---
const today = '2026-09-05'
const previousDays = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  log_date: `2026-08-2${n === 7 ? 9 : 2 + n}`,
  coaching_day: n,
  coaching_week: 1,
  overall_percent: 60 + n,
  scores: { diet: 70, workout: 50, water: 80, supplements: 0, cardio: 0, sleep: 0 },
}))
const currentDays = [
  {
    log_date: today,
    coaching_day: 8,
    coaching_week: 2,
    overall_percent: 40,
    scores: { diet: 40, workout: 0, water: 50, supplements: 0, cardio: 0, sleep: 0 },
  },
]
const week = buildWeekProgress([...previousDays, ...currentDays], today, 2)
assert('previous week has 7 days', week.previousWeek?.days.length === 7, String(week.previousWeek?.days.length))
assert('previous week average is not null', week.previousWeek?.average != null)
assert('recent days include last week and today', week.recentDays.length === 8)

const utcCutoff = new Date('2026-09-04T20:00:00.000Z')
const utcKey = utcCutoff.toISOString().slice(0, 10)
const istKey = getCoachingDateKey(utcCutoff)
assert(
  'IST date key is used instead of UTC midnight',
  istKey === '2026-09-05' && utcKey === '2026-09-04',
  `ist=${istKey} utc=${utcKey}`
)
assert('coachingDateKeyDaysAgo(7) is an IST YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(coachingDateKeyDaysAgo(7)))

// --- 2. Same meal every day ---
const cloned = scoreDietDayVariety(clonedWeek('Poha with peanuts'))
assert('cloned week is detected', cloned.cloned && cloned.distinct === 1, JSON.stringify(cloned))
assert(
  'cloned week fails different_daily',
  dietFailsRequestedVariety(clonedWeek('Poha with peanuts'), 'different_daily')
)
assert(
  'cloned week is allowed for same_daily',
  !dietFailsRequestedVariety(clonedWeek('Poha with peanuts'), 'same_daily')
)
const varied = scoreDietDayVariety(variedWeek())
assert('varied week has 7 distinct days', varied.distinct === 7, JSON.stringify(varied))
assert('varied week passes different_daily', !dietFailsRequestedVariety(variedWeek(), 'different_daily'))
assert(
  'collectDietProse reads meal example text',
  collectDietProse([{ example: clonedWeek('Poha') }]).includes('Day 1 (Monday)')
)

// --- 3. Workout reps / weight typing ---
assert('old Number("82.") drops the decimal mid-entry', Number('82.') === 82)
assert('parseOptionalNumber keeps 82. as unfinished', parseOptionalNumber('82.') === null)
assert('parseOptionalNumber accepts 82.5', parseOptionalNumber('82.5') === 82.5)
assert('parseOptionalNumber accepts empty as null', parseOptionalNumber('') === null)
assert('parseOptionalNumber accepts 12 reps', parseOptionalNumber('12') === 12)

// --- 4. Diet meal logging ---
const multiDayPlan = {
  id: 'plan-meals',
  client_id: 'client-1',
  coach_id: 'coach-1',
  title: 'Meal log smoke',
  phase: null,
  nutrition_plan: variedWeek(),
  workout_plan: '',
  cardio_plan: '',
  supplement_plan: '',
  coach_notes: '',
  version: 1,
  active: true,
  delivered_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
} as Plan

const snap = buildTrackerSnapshot(multiDayPlan)
const meals = snap.items.filter((i) => i.type === 'meal')
assert('multi-day diet parses more than one meal', meals.length >= 14, String(meals.length))
assert('multi-day diet has 7 diet days', (snap.dietDays?.length ?? 0) >= 7, String(snap.dietDays?.length))
assert(
  'every parsed meal has food text',
  meals.every((m) => m.type === 'meal' && m.foods.trim().length > 0)
)

const firstMeal = meals[0]
if (firstMeal && firstMeal.type === 'meal') {
  const afterToggle = mergeCompletion({}, { meals: { [firstMeal.id]: { completed: true } } })
  assert('meal complete patch is kept', afterToggle.meals?.[firstMeal.id]?.completed === true)
  const daySelect = mergeCompletion(afterToggle, { selectedDietDay: firstMeal.dietDay ?? 'monday' })
  assert('diet day selection survives meal log', Boolean(daySelect.selectedDietDay))
}

const emptyFoodsPlan = {
  ...multiDayPlan,
  id: 'plan-empty',
  nutrition_plan: `Day 1 (Monday)\nBreakfast:\n\nDay 2 (Tuesday)\nLunch:\n`,
} as Plan
const emptySnap = buildTrackerSnapshot(emptyFoodsPlan)
const emptyMeals = emptySnap.items.filter((i) => i.type === 'meal')
assert(
  'header-only meals are not trackable (parser skips empty foods)',
  emptyMeals.length === 0,
  String(emptyMeals.length)
)

async function liveHistorySmoke(): Promise<void> {
  const { createFakeTrialClient } = await import('../src/lib/admin/testing-accounts')
  const { assignCoachToClient } = await import('../src/lib/admin/assign-coach')
  const { createAdminClient } = await import('../src/lib/supabase/admin')
  const { loadTodayTrackerView } = await import('../src/lib/daily-tracker/service')
  const { coachAcceptsAutoAssignment } = await import('../src/lib/coach-delivery-policy')
  const { listCoachesForAssignment } = await import('../src/lib/admin/testing-accounts')

  const coaches = await listCoachesForAssignment()
  const planCoachId = coaches.find((c) => coachAcceptsAutoAssignment(c.id))?.id ?? coaches[0]?.id
  if (!planCoachId) throw new Error('No coach to attach the smoke plan')

  const account = await createFakeTrialClient(null)
  const admin = createAdminClient()
  const assigned = await assignCoachToClient(admin, account.userId, planCoachId)
  if (assigned.error) throw new Error(assigned.error)
  const started = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  await admin
    .from('profiles')
    .update({ checkin_schedule_started_at: started, onboarding_complete: true })
    .eq('id', account.userId)

  const { data: plan, error: planError } = await admin
    .from('plans')
    .insert({
      client_id: account.userId,
      coach_id: planCoachId,
      title: 'Tracker bug smoke plan',
      nutrition_plan: variedWeek(),
      workout_plan: `Day 1 (Monday)\nMain Workout\n- Bench press 3x8 @ 40 kg\n`,
      cardio_plan: '',
      supplement_plan: '',
      coach_notes: '',
      version: 1,
      active: true,
    })
    .select('id')
    .single()
  if (planError || !plan) throw new Error(planError?.message ?? 'plan insert failed')

  const todayKey = getCoachingDateKey()
  for (let n = 7; n >= 1; n--) {
    const logDate = coachingDateKeyDaysAgo(n)
    await admin.from('daily_tracker_days').insert({
      client_id: account.userId,
      log_date: logDate,
      plan_id: plan.id,
      plan_version: 1,
      coaching_day: 8 - n,
      coaching_week: 1,
      snapshot: { items: [], parserVersion: 1 },
      completion: {},
      scores: { diet: 80, workout: 70, water: 90, supplements: 0, cardio: 0, sleep: 0 },
      overall_percent: 70 + n,
    })
  }

  const { data: profile } = await admin.from('profiles').select('*').eq('id', account.userId).single()
  const { view, error } = await loadTodayTrackerView(admin, account.userId, profile as never)
  assert('live today view loads', Boolean(view) && !error, error ?? 'no view')
  assert(
    'live previous week is returned to the client tracker',
    (view?.previousWeek?.days.length ?? 0) >= 7,
    String(view?.previousWeek?.days.length)
  )
  assert('live weekly average is not empty when last week was logged', view?.weeklyAverage != null)

  const liveSnap = view?.day.snapshot
  const liveMeals = liveSnap?.items.filter((i) => i.type === 'meal') ?? []
  assert('live today snapshot has meals to log', liveMeals.length > 0, String(liveMeals.length))

  await admin.from('daily_tracker_days').delete().eq('client_id', account.userId)
  await admin.from('plans').delete().eq('client_id', account.userId)
  await admin.from('profiles').delete().eq('id', account.userId)
  await admin.auth.admin.deleteUser(account.userId)
  console.log(`Cleaned live smoke client ${account.email}`)
}

async function main() {
  if (process.argv.includes('--live')) {
    console.log('\n--- live history / meal snapshot ---')
    await liveHistorySmoke()
  }

  if (failed > 0) {
    console.error(`\n${failed} tracker bug smoke checks failed`)
    process.exit(1)
  }
  console.log('\nAll tracker bug smoke checks passed')
}

void main()
