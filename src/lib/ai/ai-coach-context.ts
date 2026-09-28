import type { SupabaseClient } from '@supabase/supabase-js'
import { splitSnapshot } from '@/lib/daily-tracker/display'
import { buildTrackerSnapshot, resolveSuggestedDayKey } from '@/lib/daily-tracker/parser'
import type { TrackerCompletion, TrackerSnapshot, TrackerWorkoutItem } from '@/lib/daily-tracker/types'
import {
  getClientCheckinSchedule,
  getCoachingDateKey,
  getCoachingDay,
  getCoachingDayInWeek,
} from '@/lib/checkin-schedule'
import { planUpdateCadenceLabel } from '@/lib/plan-update-cadence'
import { getCoachingPlan } from '@/lib/payments/plans'
import { latestCoachingPurchase } from '@/lib/payments/digital-purchase'
import { truncatePlanExcerpt } from '@/lib/ai/coach-chat-persona'
import type { CheckinType, Plan } from '@/types/database'

const DIET_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  eggetarian: 'Eggetarian',
  non_vegetarian: 'Non-veg',
}

type CheckinRow = {
  checkin_type: CheckinType
  coaching_week: number | null
  progress_photo_front: string | null
  progress_photo_side: string | null
  progress_photo_back: string | null
  pain_injuries: string | null
}

export type AiCoachThreadContext = {
  planTitle: string | null
  dietPreference: string | null
  injuryNote: string | null
  allergyNote: string | null
  purchasedPlanLine: string | null
  todayPlan: string | null
  trackerLine: string | null
  checkinLine: string | null
  nutritionExcerpt: string | null
  workoutExcerpt: string | null
}

function clip(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max).trimEnd()}…`
}

export function dietPreferenceLabel(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  return DIET_LABELS[raw] ?? raw
}

/** What this client bought, without prices. */
export function purchasedPlanLine(slug: string | null | undefined): string {
  if (!slug) return 'Purchased plan: unknown. Do not guess a price or a plan name.'
  if (slug === '3_months' || slug === '1_month') {
    return 'Purchased plan: Fat loss. Plan updates every 14 days.'
  }
  if (slug === '6_months') {
    return 'Purchased plan: Fat loss + muscle gain. Plan updates every week, with cardio and supplements.'
  }
  if (slug === '12_months') {
    return 'Purchased plan: Athletic body. Plan updates every week, with stamina coaching and a weekly coach phone call.'
  }
  const plan = getCoachingPlan(slug)
  if (!plan || plan.isDigital) {
    return 'Purchased plan: not a coaching membership. Do not mention prices.'
  }
  return `Purchased plan: ${plan.name}. Plan updates ${planUpdateCadenceLabel(slug).toLowerCase()}.`
}

function isRestWorkout(workout: TrackerWorkoutItem): boolean {
  const focus = String(workout.focus ?? '').toLowerCase()
  const title = String(workout.title ?? '').toLowerCase()
  const hasExercises = workout.exercises.length > 0
  if (!hasExercises) return true
  return /\brest\s*day\b/.test(focus) || /\brest\s*day\b/.test(title) || focus === 'rest'
}

function pickDayKey(
  days: { key: string }[] | undefined,
  selected: string | null | undefined,
  referenceDate: Date,
  coachingDayInWeek: number | null
): string | null {
  if (selected && days?.some((day) => day.key === selected)) return selected
  return resolveSuggestedDayKey(days ?? [], referenceDate, {
    coachingDayInWeek: coachingDayInWeek ?? undefined,
  })
}

export function formatTodayPlan(input: {
  snapshot: TrackerSnapshot
  completion: TrackerCompletion | null
  coachingDayInWeek: number | null
  logged: boolean
  referenceDate?: Date
}): { todayPlan: string; trackerLine: string } {
  const referenceDate = input.referenceDate ?? new Date()
  const completion = input.completion ?? {}
  const dietKey = pickDayKey(
    input.snapshot.dietDays,
    completion.selectedDietDay,
    referenceDate,
    input.coachingDayInWeek
  )
  const workoutKey = pickDayKey(
    input.snapshot.workoutDays,
    completion.selectedWorkoutDay,
    referenceDate,
    input.coachingDayInWeek
  )
  const sections = splitSnapshot(input.snapshot, { selectedWorkoutDay: workoutKey })
  const meals = sections.meals.filter((meal) => !meal.dietDay || !dietKey || meal.dietDay === dietKey)
  const mealLines = meals.slice(0, 6).map((meal) => {
    const foods = clip(typeof meal.foods === 'string' ? meal.foods : '', 120)
    return foods ? `${meal.title}: ${foods}` : meal.title
  })
  const workout =
    sections.workout ??
    sections.workouts.find((item) => item.workoutDay === workoutKey) ??
    (sections.workouts.length === 1 ? sections.workouts[0] : null)

  let workoutLine = 'Workout: not on the plan yet'
  let trained = 'Trained today: no'
  if (workout && isRestWorkout(workout)) {
    workoutLine = 'Workout: rest day'
    trained = 'Trained today: rest day'
  } else if (workout) {
    const moves = workout.exercises.slice(0, 8).map((exercise) => {
      const sets = exercise.targetSets ? `${exercise.targetSets}x${exercise.targetReps}` : exercise.targetReps
      return sets ? `${exercise.name} ${sets}` : exercise.name
    })
    workoutLine = moves.length ? `Workout: ${moves.join('; ')}` : `Workout: ${workout.title}`
    const anyLogged = workout.exercises.some((exercise) => completion.exercises?.[exercise.id]?.completed)
    trained = anyLogged ? 'Trained today: yes' : 'Trained today: no'
  }

  const mealTotal = meals.length
  const mealsLogged = meals.filter((meal) => completion.meals?.[meal.id]?.completed).length
  const mealStatus =
    mealTotal === 0
      ? 'Meals logged today: no meals on the plan'
      : input.logged
        ? `Meals logged today: ${mealsLogged} of ${mealTotal}`
        : 'Meals logged today: no'

  const todayPlan = [
    mealLines.length ? `Meals: ${mealLines.join(' | ')}` : 'Meals: not on the plan yet',
    workoutLine,
  ].join('\n')

  return {
    todayPlan: clip(todayPlan, 900) ?? todayPlan,
    trackerLine: `${mealStatus}. ${trained}.`,
  }
}

function photosComplete(row: CheckinRow | undefined): boolean {
  if (!row) return false
  return Boolean(row.progress_photo_front && row.progress_photo_side && row.progress_photo_back)
}

export function formatCheckinLine(input: {
  scheduleStartedAt: string | null | undefined
  checkinOverdue?: boolean | null
  checkins: CheckinRow[]
  referenceDate?: Date
}): string {
  if (!input.scheduleStartedAt) {
    return 'Check-in: not scheduled yet. Photos: not required today.'
  }

  let schedule: ReturnType<typeof getClientCheckinSchedule>
  try {
    schedule = getClientCheckinSchedule(input.scheduleStartedAt, input.checkins, input.referenceDate)
  } catch {
    return 'Check-in: status unavailable. Photos: not required today.'
  }

  const due = schedule.todayTasks.find((task) => task.status === 'available')
  const waiting = schedule.todayTasks.find((task) => task.status === 'awaiting_review')
  const missed = input.checkinOverdue || schedule.missedCheckins.length > 0

  const match = (week: number, type: string) =>
    input.checkins.find((row) => row.coaching_week === week && row.checkin_type === type)

  if (missed && !waiting) {
    const missedTask = schedule.missedCheckins[0]
    const row = missedTask ? match(missedTask.coachingWeek, missedTask.type) : undefined
    const photos = row && photosComplete(row) ? 'Photos: received.' : 'Photos: missing.'
    return `Check-in: overdue. ${photos}`
  }
  if (due) {
    return 'Check-in: due now. Photos: missing.'
  }
  if (waiting) {
    const row = match(waiting.coachingWeek, waiting.type)
    const photos = photosComplete(row) ? 'Photos: received.' : 'Photos: missing.'
    return `Check-in: already submitted. ${photos}`
  }
  return 'Check-in: not due. Photos: not required today.'
}

function coachingDayInWeek(scheduleStartedAt: string | null | undefined, referenceDate: Date): number | null {
  if (!scheduleStartedAt) return null
  try {
    return getCoachingDayInWeek(getCoachingDay(scheduleStartedAt, referenceDate))
  } catch {
    return null
  }
}

export async function loadAiCoachThreadContext(
  admin: SupabaseClient,
  userId: string,
  profile: {
    diet_preference?: string | null
    injuries?: string | null
    checkin_schedule_started_at?: string | null
    checkin_overdue?: boolean | null
    onboarding_data?: unknown
  }
): Promise<AiCoachThreadContext> {
  const referenceDate = new Date()
  const onboarding = profile.onboarding_data as {
    diet?: { allergies?: string | null }
    medical?: { painDuringExercise?: string | null }
  } | null

  const [{ data: plan }, coaching, { data: tracker }, { data: checkins }] = await Promise.all([
    admin
      .from('plans')
      .select(
        'id, client_id, coach_id, title, phase, workout_plan, nutrition_plan, cardio_plan, supplement_plan, coach_notes, version, active, delivered_at, updated_at, created_at'
      )
      .eq('client_id', userId)
      .eq('active', true)
      .maybeSingle(),
    latestCoachingPurchase(admin, userId),
    admin
      .from('daily_tracker_days')
      .select('completion')
      .eq('client_id', userId)
      .eq('log_date', getCoachingDateKey(referenceDate))
      .maybeSingle(),
    admin
      .from('checkins')
      .select(
        'checkin_type, coaching_week, progress_photo_front, progress_photo_side, progress_photo_back, pain_injuries'
      )
      .eq('client_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(16),
  ])

  const planRow = (plan as Plan | null) ?? null
  const checkinRows = (checkins ?? []) as CheckinRow[]
  const latestPain = checkinRows.find((row) => row.pain_injuries?.trim())?.pain_injuries
  const injuryNote =
    clip(profile.injuries, 240) ||
    clip(onboarding?.medical?.painDuringExercise, 240) ||
    clip(latestPain, 240)

  let todayPlan: string | null = null
  let trackerLine: string | null = null
  if (planRow?.nutrition_plan || planRow?.workout_plan) {
    try {
      const snapshot = buildTrackerSnapshot(planRow, null, referenceDate)
      const formatted = formatTodayPlan({
        snapshot,
        completion: (tracker?.completion as TrackerCompletion | null) ?? null,
        coachingDayInWeek: coachingDayInWeek(profile.checkin_schedule_started_at, referenceDate),
        logged: Boolean(tracker),
        referenceDate,
      })
      todayPlan = formatted.todayPlan
      trackerLine = formatted.trackerLine
    } catch {
      todayPlan = null
      trackerLine = null
    }
  }

  return {
    planTitle: planRow?.title ?? null,
    dietPreference: dietPreferenceLabel(profile.diet_preference),
    injuryNote,
    allergyNote: clip(onboarding?.diet?.allergies, 180),
    purchasedPlanLine: purchasedPlanLine(coaching?.planSlug ?? null),
    todayPlan,
    trackerLine,
    checkinLine: formatCheckinLine({
      scheduleStartedAt: profile.checkin_schedule_started_at,
      checkinOverdue: profile.checkin_overdue,
      checkins: checkinRows,
      referenceDate,
    }),
    nutritionExcerpt: todayPlan ? null : truncatePlanExcerpt(planRow?.nutrition_plan),
    workoutExcerpt: todayPlan ? null : truncatePlanExcerpt(planRow?.workout_plan),
  }
}
