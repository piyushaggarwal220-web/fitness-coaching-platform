import type {
  DailyTrackerDay,
  TrackerCardioItem,
  TrackerCategoryScores,
  TrackerCompletion,
  TrackerExerciseItem,
  TrackerSnapshot,
  TrackerSnapshotItem,
  TodayTrackerView,
  TrackerWorkoutItem,
  WorkoutPhaseBlock,
} from './types'
import { DEFAULT_WARMUP_EXERCISES } from './exercise-utils'

export type TrackerSections = {
  meals: Extract<TrackerSnapshotItem, { type: 'meal' }>[]
  workouts: Extract<TrackerSnapshotItem, { type: 'workout' }>[]
  /** Active / sole workout for the day. Null when multi-day and nothing selected yet. */
  workout: Extract<TrackerSnapshotItem, { type: 'workout' }> | null
  steps: TrackerCardioItem | null
  cardio: TrackerCardioItem[]
  supplements: Extract<TrackerSnapshotItem, { type: 'supplement' }>[]
  water: Extract<TrackerSnapshotItem, { type: 'water' }> | null
  sleep: Extract<TrackerSnapshotItem, { type: 'sleep' }> | null
  coachNote: Extract<TrackerSnapshotItem, { type: 'note' }> | null
}

export function resolveActiveWorkout(
  snapshot: TrackerSnapshot,
  completion: Pick<TrackerCompletion, 'selectedWorkoutDay'>
): TrackerWorkoutItem | null {
  const workouts = snapshot.items
    .filter((i): i is TrackerWorkoutItem => i.type === 'workout')
    .map((w) => ensureWarmupPhase(normalizeWorkout(w)))

  if (workouts.length === 0) return null

  const multiDay =
    (snapshot.workoutDays?.length ?? 0) > 1 ||
    workouts.filter((w) => Boolean(w.workoutDay)).length > 1

  if (!multiDay) return workouts[0] ?? null

  const selected = completion.selectedWorkoutDay
  if (!selected) return null
  return workouts.find((w) => w.workoutDay === selected) ?? null
}

export function splitSnapshot(
  snapshot: TrackerSnapshot,
  completion?: Pick<TrackerCompletion, 'selectedWorkoutDay'>
): TrackerSections {
  const meals = snapshot.items.filter((i): i is TrackerSections['meals'][number] => i.type === 'meal')
  const workouts = snapshot.items
    .filter((i): i is TrackerWorkoutItem => i.type === 'workout')
    .map((w) => ensureWarmupPhase(normalizeWorkout(w)))
  const workout = completion
    ? resolveActiveWorkout(snapshot, completion)
    : workouts.length <= 1
      ? workouts[0] ?? null
      : null
  const cardioAll = snapshot.items.filter((i): i is TrackerCardioItem => i.type === 'cardio')
  const steps = cardioAll.find((c) => c.unit === 'steps') ?? null
  const cardio = cardioAll.filter((c) => c.unit !== 'steps')
  const supplements = snapshot.items.filter(
    (i): i is TrackerSections['supplements'][number] => i.type === 'supplement'
  )
  const waterItem = snapshot.items.find((i) => i.type === 'water')
  const water = waterItem?.type === 'water' ? waterItem : null
  const sleepItem = snapshot.items.find((i) => i.type === 'sleep')
  const sleep = sleepItem?.type === 'sleep' ? sleepItem : null
  const noteItem = snapshot.items.find((i) => i.type === 'note')
  const coachNote = noteItem?.type === 'note' ? noteItem : null

  return { meals, workouts, workout, steps, cardio, supplements, water, sleep, coachNote }
}

/** Ensure legacy snapshots without phases still render correctly */
export function normalizeWorkout(workout: TrackerWorkoutItem): TrackerWorkoutItem {
  if (workout.phases?.length) return workout
  const exercises = workout.exercises.map((ex) => ({ ...ex, phase: ex.phase ?? 'main' }))
  const phases: WorkoutPhaseBlock[] = [
    { id: 'phase-main', phase: 'main', label: 'Main Workout', exercises },
  ]
  return { ...workout, exercises, phases }
}

/** Always keep a Warm-up section — plan warmup if present, otherwise defaults. */
export function ensureWarmupPhase(workout: TrackerWorkoutItem): TrackerWorkoutItem {
  const normalized = normalizeWorkout(workout)
  const existingWarmup = normalized.phases.find((phase) => phase.phase === 'warmup')
  if (existingWarmup && existingWarmup.exercises.length > 0) return normalized

  const warmupExercises: TrackerExerciseItem[] = DEFAULT_WARMUP_EXERCISES
  const warmupPhase: WorkoutPhaseBlock = {
    id: 'phase-warmup',
    phase: 'warmup',
    label: 'Warm-up',
    exercises: warmupExercises,
  }
  const phases = [warmupPhase, ...normalized.phases.filter((phase) => phase.phase !== 'warmup')]
  const exercises = [...warmupExercises, ...normalized.exercises.filter((ex) => ex.phase !== 'warmup')]
  return { ...normalized, phases, exercises }
}

function pct(completed: number, total: number): number {
  if (total <= 0) return 100
  return Math.round((completed / total) * 100)
}

export function getStepsScore(steps: TrackerCardioItem | null, completion: TrackerCompletion): number {
  if (!steps) return 100
  const target = Number(steps.target) || 1
  const actual = completion.cardio?.[steps.id]?.actual ?? 0
  return Math.min(100, pct(actual, target))
}

export function getCategoryDisplayScores(
  day: DailyTrackerDay
): TrackerCategoryScores & { steps: number } {
  const scores = day.scores ?? {
    diet: 0,
    workout: 0,
    water: 0,
    supplements: 0,
    cardio: 0,
    sleep: 0,
  }
  const { steps, cardio } = splitSnapshot(day.snapshot)

  let cardioScore = 100
  if (cardio.length > 0) {
    let sum = 0
    for (const item of cardio) {
      const target = Number(item.target) || 1
      const actual = day.completion.cardio?.[item.id]?.actual ?? 0
      sum += Math.min(100, pct(actual, target))
    }
    cardioScore = Math.round(sum / cardio.length)
  } else if (!steps) {
    cardioScore = scores.cardio
  }

  return {
    ...scores,
    cardio: cardioScore,
    steps: getStepsScore(steps, day.completion),
  }
}

export function computeWorkoutVolume(completion: TrackerCompletion): number {
  let volume = 0
  for (const ex of Object.values(completion.exercises ?? {})) {
    for (const set of ex.sets ?? []) {
      // Strength volume only — timed/distance/reps-only do not contribute kg volume.
      if (set.reps != null && set.weight != null && set.weight > 0) {
        volume += set.reps * set.weight
      }
    }
  }
  return Math.round(volume)
}

export function getPhaseProgress(
  block: WorkoutPhaseBlock,
  completion: TrackerCompletion
): { completed: number; total: number; percent: number } {
  const total = block.exercises.length
  const completed = block.exercises.filter((ex) => completion.exercises?.[ex.id]?.completed).length
  return { completed, total, percent: pct(completed, total) }
}

export function getWorkoutProgress(
  workout: TrackerSections['workout'],
  completion: TrackerCompletion
): { completed: number; total: number; percent: number } {
  if (!workout) return { completed: 0, total: 0, percent: 100 }
  const total = workout.exercises.length
  const completed = workout.exercises.filter((ex) => completion.exercises?.[ex.id]?.completed).length
  return { completed, total, percent: pct(completed, total) }
}

export function estimateRemainingMinutes(
  workout: TrackerSections['workout'],
  completion: TrackerCompletion,
  minutesPerExercise = 6
): number {
  if (!workout) return 0
  const remaining = workout.exercises.filter((ex) => !completion.exercises?.[ex.id]?.completed).length
  return remaining * minutesPerExercise
}

const QUALITY_SCORES = { excellent: 9, good: 7, average: 5, poor: 3 } as const

export function qualityLabelToScore(label?: string): number | undefined {
  if (!label) return undefined
  return QUALITY_SCORES[label as keyof typeof QUALITY_SCORES]
}

export function scoreToQualityLabel(score?: number): string | undefined {
  if (score == null) return undefined
  if (score >= 8) return 'Excellent'
  if (score >= 6) return 'Good'
  if (score >= 4) return 'Average'
  return 'Poor'
}

export function buildMotivationMessage(view: TodayTrackerView): string {
  const { day } = view
  const scores = getCategoryDisplayScores(day)
  const overall = day.overall_percent ?? 0
  const sections = splitSnapshot(day.snapshot, day.completion)

  if (overall >= 90) return '🔥 Outstanding day — you are crushing your plan.'
  if (overall >= 75) return '🔥 Great consistency. Keep this momentum going.'

  const selectedDiet = day.completion.selectedDietDay
  const mealsForToday = sections.meals.filter((m) => {
    if (!m.dietDay) return true
    if (!selectedDiet) return false
    return m.dietDay === selectedDiet
  })
  const mealsLeft = mealsForToday.filter((m) => !day.completion.meals?.[m.id]?.completed).length
  if (mealsLeft === 1) return "🔥 You're only one meal away from 90%."

  const workout = sections.workout
  if (workout) {
    const postWorkout = mealsForToday.find((m) => /post[- ]?workout/i.test(m.title))
    const workoutDone = workout.exercises.every((ex) => day.completion.exercises?.[ex.id]?.completed)
    if (workoutDone && postWorkout && !day.completion.meals?.[postWorkout.id]?.completed) {
      return '🔥 Finish your post-workout meal for recovery.'
    }
  }

  if (scores.water < 60) return '💧 Hydration is lagging — a quick glass of water helps.'
  if (scores.diet < 50 && mealsLeft > 0) return `🥗 ${mealsLeft} meal${mealsLeft > 1 ? 's' : ''} left — fuel your progress.`

  if (view.streak >= 3) return `🔥 ${view.streak}-day streak — don't break the chain.`

  return '🔥 Small wins stack up. Pick your next action below.'
}

export function parseCoachReminders(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length > 4 && l.length < 120)
    .slice(0, 4)
}
