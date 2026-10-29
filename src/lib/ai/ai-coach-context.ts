import type { SupabaseClient } from '@supabase/supabase-js'
import { splitSnapshot } from '@/lib/daily-tracker/display'
import { listWorkoutExercises } from '@/lib/daily-tracker/exercise-utils'
import { buildTrackerSnapshot, resolveSuggestedDayKey } from '@/lib/daily-tracker/parser'
import type { TrackerCompletion, TrackerPlanDayOption, TrackerSnapshot, TrackerWorkoutItem } from '@/lib/daily-tracker/types'
import {
  coachingDateKeyDaysAgo,
  formatCoachingDateTime,
  getClientCheckinSchedule,
  getCoachingDateKey,
  getCoachingDay,
  getCoachingDayInWeek,
} from '@/lib/checkin-schedule'
import { isBiweeklyPlanUpdate, nextAutoPlanUpdateWeek, planUpdateCadenceLabel, shouldAutoGenerateWeeklyPlanDraft } from '@/lib/plan-update-cadence'
import { getHomePlanCardCopy, getHomePlanPhase, UPDATED_PLAN_READY_WITHIN_MS } from '@/lib/checkin-reply-timing'
import { clientFacingPlanTitle } from '@/lib/plan-metadata'
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
  submitted_at?: string | null
  reviewed?: boolean
  diet_adherence?: number | null
  workout_adherence?: number | null
  energy_level?: number | null
  weight?: number | null
  adherence_wins?: string | null
  adherence_struggles?: string | null
  questions_for_coach?: string | null
  progress_photo_front: string | null
  progress_photo_side: string | null
  progress_photo_back: string | null
  pain_injuries: string | null
}

type RecentTrackerDay = {
  log_date: string
  overall_percent: number | null
  completion: TrackerCompletion | null
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
  /** Last check-in, recent logs, and when the current plan went out. */
  situationLine: string | null
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
  if (slug === 'offer_84_days') {
    return 'Purchased plan: 84-day transformation. Workout, diet, cardio, supplements, trackers, Journey, and coach chat are included. Plan updates every week. Men get a testosterone protocol. Women get hourglass guidance. All goals are unlocked.'
  }
  if (slug === 'offer_1_month' || slug === 'offer_3_months') {
    const months = slug === 'offer_1_month' ? '1 month' : '3 months'
    return `Purchased plan: full coaching for ${months}. Workout, diet, cardio, supplements, trackers, Journey, and coach chat are included. Plan updates every week. All goals are unlocked.`
  }
  if (slug === '3_months' || slug === '1_month') {
    return 'Purchased plan: Fat loss. Plan updates every 14 days.'
  }
  if (slug === '6_months') {
    return 'Purchased plan: Fat loss + muscle gain. Plan updates every week, with cardio and supplements.'
  }
  if (slug === '12_months') {
    return 'Purchased plan: Athletic body. Plan updates every week, with stamina coaching. There is no live call on this plan.'
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
  const hasExercises = listWorkoutExercises(workout).length > 0
  if (!hasExercises) return true
  return /\brest\s*day\b/.test(focus) || /\brest\s*day\b/.test(title) || focus === 'rest'
}

function pickDayKey(
  days: TrackerPlanDayOption[] | undefined,
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
    const exercises = listWorkoutExercises(workout)
    const moves = exercises.slice(0, 8).map((exercise) => {
      const sets = exercise.targetSets ? `${exercise.targetSets}x${exercise.targetReps}` : exercise.targetReps
      return sets ? `${exercise.name} ${sets}` : exercise.name
    })
    workoutLine = moves.length ? `Workout: ${moves.join('; ')}` : `Workout: ${workout.title}`
    const anyLogged = exercises.some((exercise) => completion.exercises?.[exercise.id]?.completed)
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

function scoreBit(label: string, value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return `${label} ${value}/10`
}

function summarizeTrackerDay(day: RecentTrackerDay): string {
  const completion = day.completion
  const meals = completion?.meals ? Object.values(completion.meals) : []
  const mealsDone = meals.filter((meal) => meal.completed).length
  const exercises = completion?.exercises ? Object.values(completion.exercises) : []
  const trained =
    exercises.some((exercise) => exercise.completed) || completion?.workoutSession?.status === 'saved'
  const parts = [
    meals.length ? `meals ${mealsDone}/${meals.length}` : null,
    trained ? 'trained' : 'no workout logged',
    typeof completion?.water?.ml === 'number' && completion.water.ml > 0
      ? `water ${completion.water.ml} ml`
      : null,
    typeof completion?.sleep?.hours === 'number' ? `sleep ${completion.sleep.hours}h` : null,
    typeof day.overall_percent === 'number' ? `${day.overall_percent}% logged` : null,
  ].filter(Boolean)
  return `${day.log_date}: ${parts.join(', ')}`
}

/** Facts Smart Coach must already know: last check-in, recent logs, plan delivery. */
export function formatClientSituation(input: {
  planTitle?: string | null
  planDeliveredAt: string | null | undefined
  planSlug: string | null | undefined
  checkins: CheckinRow[]
  recentDays: RecentTrackerDay[]
}): string {
  const lines: string[] = []
  const latest = input.checkins.find((row) => row.submitted_at)
  const latestWeekly = input.checkins.find((row) => row.checkin_type === 'weekly' && row.submitted_at)
  const anchor = latestWeekly ?? latest
  const updatesPlan =
    anchor?.checkin_type === 'weekly' &&
    typeof anchor.coaching_week === 'number' &&
    shouldAutoGenerateWeeklyPlanDraft(input.planSlug, anchor.coaching_week)
  const submittedMs = anchor?.submitted_at ? Date.parse(anchor.submitted_at) : Number.NaN
  const deliveredMs = input.planDeliveredAt ? Date.parse(input.planDeliveredAt) : Number.NaN
  const phase = getHomePlanPhase({
    hasActivePlan: Boolean(input.planDeliveredAt),
    expectsUpdate: updatesPlan,
    submittedAtMs: Number.isFinite(submittedMs) ? submittedMs : null,
    deliveredAtMs: Number.isFinite(deliveredMs) ? deliveredMs : null,
  })
  const week = typeof anchor?.coaching_week === 'number' ? anchor.coaching_week : null
  const weekForNext = phase === 'delivered_for_checkin' && week != null ? week + 1 : week
  const card = getHomePlanCardCopy({
    phase,
    planTitle: input.planTitle ? clientFacingPlanTitle(input.planTitle) : null,
    deliveredAtLabel: input.planDeliveredAt ? formatCoachingDateTime(input.planDeliveredAt) : null,
    biweekly: isBiweeklyPlanUpdate(input.planSlug),
    nextUpdateWeek: weekForNext != null ? nextAutoPlanUpdateWeek(input.planSlug, weekForNext) : null,
    weeklyDueNow: false,
    checkedInAt: anchor?.submitted_at ? formatCoachingDateTime(anchor.submitted_at) : null,
    readyBy: Number.isFinite(submittedMs)
      ? formatCoachingDateTime(new Date(submittedMs + UPDATED_PLAN_READY_WITHIN_MS))
      : null,
    overdue: Number.isFinite(submittedMs) && Date.now() >= submittedMs + UPDATED_PLAN_READY_WITHIN_MS,
  })
  lines.push(card.currentLine)
  lines.push(card.nextLine)
  if (phase !== 'waiting' && phase !== 'no_plan') {
    lines.push('Do not say the plan is still being created.')
  }

  if (!latest?.submitted_at) {
    lines.push('Last check-in: none yet.')
  } else {
    const kind = latest.checkin_type === 'mid_week' ? 'mid-week' : 'weekly'
    const week = typeof latest.coaching_week === 'number' ? ` week ${latest.coaching_week}` : ''
    const details = [
      scoreBit('diet adherence', latest.diet_adherence),
      scoreBit('workout adherence', latest.workout_adherence),
      scoreBit('energy', latest.energy_level),
      typeof latest.weight === 'number' ? `weight ${latest.weight} kg` : null,
      clip(latest.adherence_wins, 160) ? `wins: ${clip(latest.adherence_wins, 160)}` : null,
      clip(latest.adherence_struggles, 160)
        ? `struggles: ${clip(latest.adherence_struggles, 160)}`
        : null,
      clip(latest.questions_for_coach, 180)
        ? `asked: ${clip(latest.questions_for_coach, 180)}`
        : null,
      clip(latest.pain_injuries, 160) ? `pain: ${clip(latest.pain_injuries, 160)}` : null,
    ].filter(Boolean)
    lines.push(
      `Last check-in: ${kind}${week}, submitted ${formatCoachingDateTime(latest.submitted_at)} IST. ${
        latest.reviewed ? 'Already reviewed.' : 'Not reviewed yet.'
      }${details.length ? ` ${details.join('. ')}.` : ''}`
    )
  }

  const previous = input.checkins.filter((row) => row.submitted_at).slice(1, 2)[0]
  if (previous?.submitted_at) {
    const kind = previous.checkin_type === 'mid_week' ? 'mid-week' : 'weekly'
    lines.push(
      `Check-in before that: ${kind}${
        typeof previous.coaching_week === 'number' ? ` week ${previous.coaching_week}` : ''
      }, ${formatCoachingDateTime(previous.submitted_at)} IST.`
    )
  }

  if (input.recentDays.length === 0) {
    lines.push('Recent tracking: nothing logged in the last 7 days.')
  } else {
    lines.push(
      `Recent tracking (newest first): ${input.recentDays.slice(0, 7).map(summarizeTrackerDay).join(' | ')}`
    )
  }

  return clip(lines.join('\n'), 1800) ?? lines.join('\n')
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

  const [{ data: plan }, coaching, { data: tracker }, { data: checkins }, { data: recentDays }] =
    await Promise.all([
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
        'checkin_type, coaching_week, submitted_at, reviewed, diet_adherence, workout_adherence, energy_level, weight, adherence_wins, adherence_struggles, questions_for_coach, progress_photo_front, progress_photo_side, progress_photo_back, pain_injuries'
      )
      .eq('client_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(16),
    admin
      .from('daily_tracker_days')
      .select('log_date, overall_percent, completion')
      .eq('client_id', userId)
      .gte('log_date', coachingDateKeyDaysAgo(6, referenceDate))
      .order('log_date', { ascending: false })
      .limit(7),
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
    situationLine: formatClientSituation({
      planTitle: planRow?.title,
      planDeliveredAt: planRow?.delivered_at,
      planSlug: coaching?.planSlug ?? null,
      checkins: checkinRows,
      recentDays: (recentDays ?? []) as RecentTrackerDay[],
    }),
    nutritionExcerpt: todayPlan ? null : truncatePlanExcerpt(planRow?.nutrition_plan),
    workoutExcerpt: todayPlan ? null : truncatePlanExcerpt(planRow?.workout_plan),
  }
}
