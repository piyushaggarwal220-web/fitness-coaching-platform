import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getClientCheckinSchedule,
  getCoachingDateKey,
  getCoachingDay,
  getCoachingWeek,
  hasCoachingDayStarted,
} from '@/lib/checkin-schedule'
import type { OnboardingProfile, Plan } from '@/types/database'
import {
  TRACKER_PARSER_VERSION,
  buildTrackerSnapshot,
  mergeCompletion,
  planContentSignature,
  remapWorkoutDayKey,
} from './parser'
import { averageRpe, calculateTrackerScores } from './scores'
import type {
  DailyTrackerDay,
  TodayTrackerView,
  TrackerAdherenceSummary,
  TrackerCompletion,
  TrackerCategoryScores,
} from './types'

function todayDateString(reference = new Date()): string {
  return getCoachingDateKey(reference)
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function rowToDay(row: Record<string, unknown>): DailyTrackerDay {
  return {
    id: row.id as string,
    client_id: row.client_id as string,
    log_date: row.log_date as string,
    plan_id: (row.plan_id as string) ?? null,
    plan_version: row.plan_version as number,
    coaching_day: (row.coaching_day as number) ?? null,
    coaching_week: (row.coaching_week as number) ?? null,
    snapshot: row.snapshot as DailyTrackerDay['snapshot'],
    completion: (row.completion as TrackerCompletion) ?? {},
    scores: (row.scores as TrackerCategoryScores) ?? null,
    overall_percent: (row.overall_percent as number) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function getActivePlan(
  supabase: SupabaseClient,
  clientId: string
): Promise<Plan | null> {
  const { data } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Plan | null) ?? null
}

async function computeStreak(supabase: SupabaseClient, clientId: string): Promise<number> {
  const { data } = await supabase
    .from('daily_tracker_days')
    .select('log_date, overall_percent')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false })
    .limit(30)

  let streak = 0
  const today = todayDateString()
  for (const row of data ?? []) {
    const date = row.log_date as string
    if (date > today) continue
    const pct = row.overall_percent as number | null
    if ((pct ?? 0) >= 60) streak++
    else break
  }
  return streak
}

async function weeklyAverage(supabase: SupabaseClient, clientId: string): Promise<number | null> {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { data } = await supabase
    .from('daily_tracker_days')
    .select('overall_percent')
    .eq('client_id', clientId)
    .gte('log_date', weekAgo.toISOString().slice(0, 10))

  const values = (data ?? [])
    .map((r) => r.overall_percent as number | null)
    .filter((v): v is number => v != null)
  if (values.length === 0) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

function getWorkoutPhaseSignature(snapshot: {
  items: DailyTrackerDay['snapshot']['items']
  workoutDays?: DailyTrackerDay['snapshot']['workoutDays']
}): string {
  const workouts = snapshot.items.filter((item) => item.type === 'workout')
  if (workouts.length === 0) return ''
  return [
    `n:${workouts.length}`,
    `days:${(snapshot.workoutDays ?? []).map((d) => d.key).join(',')}`,
    ...workouts.map((workout) => {
      if (workout.type !== 'workout') return ''
      const phases = workout.phases ?? []
      return [
        workout.workoutDay ?? 'default',
        `ex:${workout.exercises.length}`,
        ...phases.map((phase) => `${phase.phase}:${phase.exercises.length}`),
      ].join('|')
    }),
  ].join(';')
}

/** Detect meal/workout/cardio edits that keep the same item count. */
function snapshotContentFingerprint(snapshot: DailyTrackerDay['snapshot']): string {
  const dayKeys = [
    `dietDays:${(snapshot.dietDays ?? []).map((d) => d.key).join(',')}`,
    `workoutDays:${(snapshot.workoutDays ?? []).map((d) => d.key).join(',')}`,
  ]
  const items = snapshot.items.map((item) => {
    if (item.type === 'meal') {
      const foods = Array.isArray(item.foods) ? item.foods.join(',') : String(item.foods ?? '')
      return `meal:${item.id}:${item.title}:${foods}:${item.mealTime ?? ''}:${item.dietDay ?? ''}`
    }
    if (item.type === 'workout') {
      const names = (item.exercises ?? [])
        .map((ex) => `${ex.name}:${ex.targetSets}:${ex.targetReps}`)
        .join(',')
      const phases = (item.phases ?? [])
        .map((phase) => `${phase.phase}:${phase.exercises.map((ex) => ex.name).join(',')}`)
        .join('/')
      return `workout:${item.id}:${item.title}:${item.workoutDay ?? ''}:${names}:${phases}`
    }
    if (item.type === 'cardio') {
      return `cardio:${item.id}:${item.title}:${item.target ?? ''}:${item.unit ?? ''}`
    }
    if (item.type === 'supplement') {
      return `supp:${item.id}:${item.title}:${item.dose ?? ''}`
    }
    if (item.type === 'water') {
      return `water:${item.id}:${item.targetMl}`
    }
    if (item.type === 'sleep') {
      return `sleep:${item.id}:${item.targetBedtime ?? ''}:${item.targetHours ?? ''}`
    }
    return `note:${item.id}:${item.body}`
  })
  return [...dayKeys, ...items].join('|')
}

function sanitizeCompletionForSnapshot(
  completion: TrackerCompletion,
  snapshot: DailyTrackerDay['snapshot']
): TrackerCompletion {
  const next: TrackerCompletion = { ...completion }
  const itemIds = new Set(snapshot.items.map((item) => item.id))
  const exerciseIds = new Set(
    snapshot.items.flatMap((item) => {
      if (item.type !== 'workout') return [] as string[]
      const fromPhases =
        item.phases?.flatMap((phase) => phase.exercises.map((exercise) => exercise.id)) ?? []
      const fromRoot = item.exercises?.map((exercise) => exercise.id) ?? []
      return [...fromPhases, ...fromRoot]
    })
  )

  if (next.selectedDietDay) {
    const days = snapshot.dietDays ?? []
    const stillValid =
      days.some((d) => d.key === next.selectedDietDay) ||
      snapshot.items.some(
        (item) => item.type === 'meal' && item.dietDay === next.selectedDietDay
      )
    if (!stillValid) {
      const remapped = remapWorkoutDayKey(next.selectedDietDay, days)
      next.selectedDietDay = remapped
    }
  }

  if (next.selectedWorkoutDay) {
    const days = snapshot.workoutDays ?? []
    const stillValid =
      days.some((d) => d.key === next.selectedWorkoutDay) ||
      snapshot.items.some(
        (item) => item.type === 'workout' && item.workoutDay === next.selectedWorkoutDay
      )
    if (!stillValid) {
      const remapped = remapWorkoutDayKey(next.selectedWorkoutDay, days)
      next.selectedWorkoutDay = remapped
    }
  }

  if (next.meals) {
    const meals: NonNullable<TrackerCompletion['meals']> = {}
    for (const [id, value] of Object.entries(next.meals)) {
      if (itemIds.has(id)) meals[id] = value
    }
    next.meals = meals
  }

  if (next.exercises) {
    const exercises: NonNullable<TrackerCompletion['exercises']> = {}
    for (const [id, value] of Object.entries(next.exercises)) {
      if (exerciseIds.has(id) || itemIds.has(id)) exercises[id] = value
    }
    next.exercises = exercises
  }

  if (next.cardio) {
    const cardio: NonNullable<TrackerCompletion['cardio']> = {}
    for (const [id, value] of Object.entries(next.cardio)) {
      if (itemIds.has(id)) cardio[id] = value
    }
    next.cardio = cardio
  }

  if (next.supplements) {
    const supplements: NonNullable<TrackerCompletion['supplements']> = {}
    for (const [id, value] of Object.entries(next.supplements)) {
      if (itemIds.has(id)) supplements[id] = value
    }
    next.supplements = supplements
  }

  return next
}

export async function getOrCreateTodayTracker(
  supabase: SupabaseClient,
  clientId: string,
  profile: OnboardingProfile,
  options?: { force?: boolean }
): Promise<{ day: DailyTrackerDay | null; error: string | null }> {
  const force = options?.force === true
  const plan = await getActivePlan(supabase, clientId)
  if (!plan) {
    return { day: null, error: 'No active plan. Your coach will deliver your plan soon.' }
  }
  if (!profile.checkin_schedule_started_at) {
    return { day: null, error: 'Your coaching schedule will begin when your first plan is delivered.' }
  }
  if (!hasCoachingDayStarted(profile.checkin_schedule_started_at)) {
    return {
      day: null,
      error: 'Your first coaching day begins tomorrow at 12:00 AM.',
    }
  }

  const logDate = todayDateString()
  const coachingDay = getCoachingDay(profile.checkin_schedule_started_at)
  const coachingWeek = getCoachingWeek(coachingDay)

  const { data: existing } = await supabase
    .from('daily_tracker_days')
    .select('*')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .maybeSingle()

  const snapshot = buildTrackerSnapshot(plan, profile)
  const now = new Date().toISOString()

  if (existing) {
    const existingDay = rowToDay(existing as Record<string, unknown>)
    const existingHasWorkout = existingDay.snapshot.items.some((item) => item.type === 'workout')
    const newHasWorkout = snapshot.items.some((item) => item.type === 'workout')
    const existingHasMeals = existingDay.snapshot.items.some((item) => item.type === 'meal')
    const newHasMeals = snapshot.items.some((item) => item.type === 'meal')
    const snapshotPlanStamp =
      existingDay.snapshot.planUpdatedAt ?? existingDay.snapshot.generatedAt
    const planEditedAfterSnapshot =
      Boolean(plan.updated_at) &&
      new Date(plan.updated_at).getTime() > new Date(snapshotPlanStamp).getTime()
    const activePlanSignature = planContentSignature(plan)
    const snapshotPlanSignature =
      existingDay.snapshot.planContentSignature ?? null
    const planContentChanged =
      snapshotPlanSignature == null || snapshotPlanSignature !== activePlanSignature
    const workoutStructureChanged =
      getWorkoutPhaseSignature(existingDay.snapshot) !== getWorkoutPhaseSignature(snapshot)
    const contentChanged =
      snapshotContentFingerprint(existingDay.snapshot) !== snapshotContentFingerprint(snapshot)
    const parserStale = existingDay.snapshot.parserVersion !== TRACKER_PARSER_VERSION
    const needsRebuild =
      parserStale ||
      existingDay.plan_version !== plan.version ||
      existingDay.plan_id !== plan.id ||
      existingDay.snapshot.planId !== plan.id ||
      existingDay.snapshot.planVersion !== plan.version ||
      planEditedAfterSnapshot ||
      planContentChanged ||
      workoutStructureChanged ||
      contentChanged ||
      (newHasWorkout && !existingHasWorkout) ||
      (newHasMeals && !existingHasMeals) ||
      snapshot.items.length !== existingDay.snapshot.items.length

    // Keep coaching day/week current even when the plan snapshot is unchanged.
    const coachingFieldsStale =
      existingDay.coaching_day !== coachingDay || existingDay.coaching_week !== coachingWeek

    // `force` lets a client explicitly rebuild today's snapshot from the active plan when the
    // automatic change detection misses an edit (a common "my tracker is showing the wrong
    // workout" report). Logged progress is preserved via sanitizeCompletionForSnapshot.
    if (!needsRebuild && !force && !coachingFieldsStale) {
      return { day: existingDay, error: null }
    }

    if (!needsRebuild && !force && coachingFieldsStale) {
      // Do not bump updated_at — that column is the optimistic-concurrency token
      // for tracker PATCH and must not race with in-flight set / Change day saves.
      const { data: touched, error: touchError } = await supabase
        .from('daily_tracker_days')
        .update({
          coaching_day: coachingDay,
          coaching_week: coachingWeek,
        })
        .eq('id', existingDay.id)
        .select()
        .single()

      if (touchError || !touched) {
        return { day: null, error: touchError?.message ?? 'Failed to refresh coaching day' }
      }
      return { day: rowToDay(touched as Record<string, unknown>), error: null }
    }

    const completion = sanitizeCompletionForSnapshot(existingDay.completion, snapshot)
    const { scores, overall } = calculateTrackerScores(snapshot, completion)
    const { data: updated, error } = await supabase
      .from('daily_tracker_days')
      .update({
        plan_id: plan.id,
        plan_version: plan.version,
        coaching_day: coachingDay,
        coaching_week: coachingWeek,
        snapshot,
        completion,
        scores,
        overall_percent: overall,
        updated_at: now,
      })
      .eq('id', existingDay.id)
      .select()
      .single()

    if (error || !updated) return { day: null, error: error?.message ?? 'Failed to refresh tracker' }
    return { day: rowToDay(updated as Record<string, unknown>), error: null }
  }

  const completion: TrackerCompletion = {}
  const { scores, overall } = calculateTrackerScores(snapshot, completion)

  const { data: inserted, error } = await supabase
    .from('daily_tracker_days')
    .insert({
      client_id: clientId,
      log_date: logDate,
      plan_id: plan.id,
      plan_version: plan.version,
      coaching_day: coachingDay,
      coaching_week: coachingWeek,
      snapshot,
      completion,
      scores,
      overall_percent: overall,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !inserted) {
    const uniqueViolation = error?.code === '23505'
    if (uniqueViolation) {
      const { data: raced } = await supabase
        .from('daily_tracker_days')
        .select('*')
        .eq('client_id', clientId)
        .eq('log_date', logDate)
        .maybeSingle()
      if (raced) return { day: rowToDay(raced as Record<string, unknown>), error: null }
    }
    return { day: null, error: error?.message ?? 'Failed to create tracker' }
  }
  return { day: rowToDay(inserted as Record<string, unknown>), error: null }
}

export async function updateTrackerCompletion(
  supabase: SupabaseClient,
  clientId: string,
  dayId: string,
  patch: TrackerCompletion
): Promise<{ day: DailyTrackerDay | null; error: string | null }> {
  // Optimistic concurrency: concurrent PATCHes from rapid set logging + "Save workout"
  // used to overwrite each other (last write wins with a stale read). Retry on conflict.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing, error: loadError } = await supabase
      .from('daily_tracker_days')
      .select('*')
      .eq('id', dayId)
      .eq('client_id', clientId)
      .single()

    if (loadError || !existing) {
      return { day: null, error: loadError?.message ?? 'Tracker day not found' }
    }

    const current = rowToDay(existing as Record<string, unknown>)
    const completion = mergeCompletion(current.completion, patch)
    const { scores, overall } = calculateTrackerScores(current.snapshot, completion)
    const now = new Date().toISOString()
    const expectedUpdatedAt = current.updated_at

    const { data: updated, error } = await supabase
      .from('daily_tracker_days')
      .update({ completion, scores, overall_percent: overall, updated_at: now })
      .eq('id', dayId)
      .eq('client_id', clientId)
      .eq('updated_at', expectedUpdatedAt)
      .select()
      .maybeSingle()

    if (!error && updated) {
      return { day: rowToDay(updated as Record<string, unknown>), error: null }
    }

    if (error) {
      return { day: null, error: error.message }
    }

    // Zero rows updated → another write landed first; reload and merge again.
  }

  return {
    day: null,
    error: 'Could not save your tracker because another update finished first. Please tap Save again.',
  }
}

export async function refreshTodayTrackerAfterPlanPublish(
  supabase: SupabaseClient,
  clientId: string,
  plan: Plan,
  profile?: OnboardingProfile | null
): Promise<void> {
  const scheduleStartedAt = profile?.checkin_schedule_started_at
  if (!scheduleStartedAt || !hasCoachingDayStarted(scheduleStartedAt)) return

  const logDate = todayDateString()
  const { data: existing } = await supabase
    .from('daily_tracker_days')
    .select('*')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .maybeSingle()

  const snapshot = buildTrackerSnapshot(plan, profile ?? undefined)
  const now = new Date().toISOString()

  if (existing) {
    const current = rowToDay(existing as Record<string, unknown>)
    const completion = sanitizeCompletionForSnapshot(current.completion, snapshot)
    const { scores, overall } = calculateTrackerScores(snapshot, completion)
    await supabase
      .from('daily_tracker_days')
      .update({
        plan_id: plan.id,
        plan_version: plan.version,
        snapshot,
        completion,
        scores,
        overall_percent: overall,
        updated_at: now,
      })
      .eq('id', current.id)
    return
  }

  const coachingDay = getCoachingDay(scheduleStartedAt)
  const coachingWeek = getCoachingWeek(coachingDay)
  const completion: TrackerCompletion = {}
  const { scores, overall } = calculateTrackerScores(snapshot, completion)

  await supabase.from('daily_tracker_days').insert({
    client_id: clientId,
    log_date: logDate,
    plan_id: plan.id,
    plan_version: plan.version,
    coaching_day: coachingDay,
    coaching_week: coachingWeek,
    snapshot,
    completion,
    scores,
    overall_percent: overall,
    created_at: now,
    updated_at: now,
  })
}

export async function loadTodayTrackerView(
  supabase: SupabaseClient,
  clientId: string,
  profile: OnboardingProfile,
  options?: { force?: boolean }
): Promise<{ view: TodayTrackerView | null; error: string | null }> {
  const { day, error } = await getOrCreateTodayTracker(supabase, clientId, profile, options)
  if (error || !day) return { view: null, error }

  const schedule = getClientCheckinSchedule(
    profile.checkin_schedule_started_at,
    []
  )
  const streak = await computeStreak(supabase, clientId)
  const weeklyAvg = await weeklyAverage(supabase, clientId)

  return {
    view: {
      day,
      schedule: {
        // Live schedule wins so the hub never sticks on a stale Day 1 row value.
        coachingDay: schedule.coachingDay,
        coachingWeek: schedule.activeCoachingWeek,
        countdownLabel: schedule.countdownLabel,
        countdownMs: schedule.countdownMs,
      },
      greeting: greetingForHour(new Date().getHours()),
      streak,
      weeklyAverage: weeklyAvg,
    },
    error: null,
  }
}

export async function loadTrackerHistory(
  supabase: SupabaseClient,
  clientId: string,
  limit = 14
): Promise<DailyTrackerDay[]> {
  const { data } = await supabase
    .from('daily_tracker_days')
    .select('*')
    .eq('client_id', clientId)
    .order('log_date', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => rowToDay(row as Record<string, unknown>))
}

export async function loadClientAdherenceSummary(
  supabase: SupabaseClient,
  clientId: string,
  periodDays = 7
): Promise<TrackerAdherenceSummary> {
  const since = new Date()
  since.setDate(since.getDate() - periodDays)

  const { data } = await supabase
    .from('daily_tracker_days')
    .select('id, client_id, log_date, plan_id, plan_version, coaching_day, coaching_week, snapshot, completion, scores, overall_percent, created_at, updated_at')
    .eq('client_id', clientId)
    .gte('log_date', since.toISOString().slice(0, 10))
    .order('log_date', { ascending: false })

  return summarizeAdherenceDays(
    clientId,
    periodDays,
    (data ?? []).map((row) => rowToDay(row as Record<string, unknown>))
  )
}

/** Batch adherence for many clients in one round-trip (coach dashboard). */
export async function loadCoachAdherenceSummaries(
  supabase: SupabaseClient,
  clients: { id: string; name: string | null }[],
  periodDays = 7
): Promise<Array<TrackerAdherenceSummary & { clientName: string | null }>> {
  if (clients.length === 0) return []

  const since = new Date()
  since.setDate(since.getDate() - periodDays)
  const sinceKey = since.toISOString().slice(0, 10)
  const clientIds = clients.map((c) => c.id)

  // Panel only needs scores + overall — skip huge snapshot/completion payloads.
  const { data } = await supabase
    .from('daily_tracker_days')
    .select('client_id, scores, overall_percent')
    .in('client_id', clientIds)
    .gte('log_date', sinceKey)

  const daysByClient = new Map<string, { scores: TrackerCategoryScores | null; overall_percent: number | null }[]>()
  for (const row of data ?? []) {
    const clientId = row.client_id as string
    const list = daysByClient.get(clientId) ?? []
    list.push({
      scores: (row.scores as TrackerCategoryScores | null) ?? null,
      overall_percent: (row.overall_percent as number | null) ?? null,
    })
    daysByClient.set(clientId, list)
  }

  const empty: TrackerCategoryScores = {
    diet: 0,
    workout: 0,
    water: 0,
    supplements: 0,
    cardio: 0,
    sleep: 0,
  }

  const nameById = new Map(clients.map((c) => [c.id, c.name]))

  return clients.map((client) => {
    const days = daysByClient.get(client.id) ?? []
    if (days.length === 0) {
      return {
        clientId: client.id,
        clientName: nameById.get(client.id) ?? null,
        periodDays,
        overallAverage: 0,
        categories: { ...empty },
        weeklyCompletion: 0,
        averageRpe: null,
        missedMeals: 0,
        missedWorkouts: 0,
        exercisePerformance: [],
      }
    }

    const categories: TrackerCategoryScores = { ...empty }
    for (const key of Object.keys(empty) as (keyof TrackerCategoryScores)[]) {
      const vals = days.map((d) => d.scores?.[key] ?? 0)
      categories[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    }

    const overallAverage = Math.round(
      days.reduce((s, d) => s + (d.overall_percent ?? 0), 0) / days.length
    )

    return {
      clientId: client.id,
      clientName: nameById.get(client.id) ?? null,
      periodDays,
      overallAverage,
      categories,
      weeklyCompletion: overallAverage,
      averageRpe: null,
      missedMeals: 0,
      missedWorkouts: 0,
      exercisePerformance: [],
    }
  })
}

function summarizeAdherenceDays(
  clientId: string,
  periodDays: number,
  days: DailyTrackerDay[]
): TrackerAdherenceSummary {
  const empty: TrackerCategoryScores = {
    diet: 0,
    workout: 0,
    water: 0,
    supplements: 0,
    cardio: 0,
    sleep: 0,
  }

  if (days.length === 0) {
    return {
      clientId,
      periodDays,
      overallAverage: 0,
      categories: empty,
      weeklyCompletion: 0,
      averageRpe: null,
      missedMeals: 0,
      missedWorkouts: 0,
      exercisePerformance: [],
    }
  }

  const categories: TrackerCategoryScores = { ...empty }
  for (const key of Object.keys(empty) as (keyof TrackerCategoryScores)[]) {
    const vals = days.map((d) => d.scores?.[key] ?? 0)
    categories[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  const overallAverage = Math.round(
    days.reduce((s, d) => s + (d.overall_percent ?? 0), 0) / days.length
  )

  let missedMeals = 0
  let missedWorkouts = 0
  const rpes: number[] = []

  for (const day of days) {
    const selectedWorkout = day.completion.selectedWorkoutDay
    const hasWorkoutDays =
      Boolean(day.snapshot.workoutDays?.length) ||
      day.snapshot.items.some((i) => i.type === 'workout' && Boolean(i.workoutDay))

    for (const item of day.snapshot.items) {
      if (item.type === 'meal' && !day.completion.meals?.[item.id]?.completed) missedMeals++
      if (item.type === 'workout') {
        if (hasWorkoutDays && item.workoutDay && item.workoutDay !== selectedWorkout) continue
        if (hasWorkoutDays && !selectedWorkout) {
          missedWorkouts++
          continue
        }
        const allDone = item.exercises.every((ex) => day.completion.exercises?.[ex.id]?.completed)
        if (!allDone) missedWorkouts++
      }
    }
    const dayRpe = averageRpe(day.completion)
    if (dayRpe != null) rpes.push(dayRpe)
  }

  return {
    clientId,
    periodDays,
    overallAverage,
    categories,
    weeklyCompletion: overallAverage,
    averageRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    missedMeals,
    missedWorkouts,
    exercisePerformance: [],
  }
}

export function buildAiAdherenceContext(summary: TrackerAdherenceSummary): Record<string, unknown> {
  return {
    workout_adherence: summary.categories.workout,
    diet_adherence: summary.categories.diet,
    cardio_adherence: summary.categories.cardio,
    water_adherence: summary.categories.water,
    supplement_adherence: summary.categories.supplements,
    sleep_adherence: summary.categories.sleep,
    average_rpe: summary.averageRpe,
    weekly_completion: summary.weeklyCompletion,
    missed_meals: summary.missedMeals,
    missed_workouts: summary.missedWorkouts,
  }
}
