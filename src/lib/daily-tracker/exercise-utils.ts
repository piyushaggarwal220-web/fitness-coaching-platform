import type { ExerciseCompletion, ExerciseSetLog, TrackerExerciseItem } from './types'

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
