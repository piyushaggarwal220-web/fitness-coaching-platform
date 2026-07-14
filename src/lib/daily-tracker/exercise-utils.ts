import type { ExerciseCompletion, ExerciseSetLog, TrackerExerciseItem } from './types'

/** Used whenever a plan has no warm-up block — always keep one option available. */
export const DEFAULT_WARMUP_EXERCISES: TrackerExerciseItem[] = [
  {
    id: 'ex-warmup-default-cardio',
    name: 'Light cardio (walk / jog / bike)',
    targetSets: 1,
    targetReps: '3-5 min',
    phase: 'warmup',
    restSeconds: 30,
  },
  {
    id: 'ex-warmup-default-arm-circles',
    name: 'Arm circles',
    targetSets: 1,
    targetReps: '10 each way',
    phase: 'warmup',
    restSeconds: 20,
  },
  {
    id: 'ex-warmup-default-squats',
    name: 'Bodyweight squats',
    targetSets: 1,
    targetReps: '10',
    phase: 'warmup',
    restSeconds: 20,
  },
  {
    id: 'ex-warmup-default-hips',
    name: 'Hip openers / cat-cows',
    targetSets: 1,
    targetReps: '8-10',
    phase: 'warmup',
    restSeconds: 20,
  },
  {
    id: 'ex-warmup-default-glutes',
    name: 'Glute bridges',
    targetSets: 1,
    targetReps: '10',
    phase: 'warmup',
    restSeconds: 20,
  },
]

export function defaultSetsForExercise(ex: TrackerExerciseItem): ExerciseSetLog[] {
  return Array.from({ length: ex.targetSets }, () => ({}))
}

export function getExerciseSets(
  ex: TrackerExerciseItem,
  data?: ExerciseCompletion
): ExerciseSetLog[] {
  const existing = data?.sets ?? []
  if (existing.length >= ex.targetSets) return existing.slice(0, ex.targetSets)
  return [...existing, ...Array.from({ length: ex.targetSets - existing.length }, () => ({}))]
}

export function areAllSetsComplete(ex: TrackerExerciseItem, sets: ExerciseSetLog[]): boolean {
  const target = sets.slice(0, ex.targetSets)
  if (target.length < ex.targetSets) return false
  return target.every((s) => s.completed)
}

export function buildExercisePatch(
  ex: TrackerExerciseItem,
  data: ExerciseCompletion | undefined,
  sets: ExerciseSetLog[]
): ExerciseCompletion {
  const completed = areAllSetsComplete(ex, sets)
  return { completed, sets, notes: data?.notes }
}

export function getCurrentExercise(
  exercises: TrackerExerciseItem[],
  completion: Record<string, ExerciseCompletion> | undefined
): TrackerExerciseItem | null {
  return exercises.find((ex) => !completion?.[ex.id]?.completed) ?? null
}

/** Prefer plan-specified rest; otherwise infer from phase / rep scheme. */
export function resolveRestSeconds(ex: TrackerExerciseItem): number {
  if (ex.restSeconds != null && ex.restSeconds > 0) return ex.restSeconds
  if (ex.phase === 'warmup' || ex.phase === 'mobility') return 30
  if (ex.phase === 'cooldown') return 45
  if (ex.phase === 'finisher') return 60

  const firstRep = Number.parseInt(String(ex.targetReps).replace(/[^\d].*$/, ''), 10)
  if (!Number.isFinite(firstRep)) return 90
  if (firstRep <= 5) return 180
  if (firstRep <= 8) return 120
  if (firstRep <= 12) return 90
  return 60
}

export function formatRestClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
