import type {
  ExerciseCompletion,
  ExerciseSetLog,
  ExerciseTrackingMode,
  TrackerExerciseItem,
} from './types'

/** Infer how an exercise should be logged from its prescription text. */
export function inferTrackingMode(ex: Pick<
  TrackerExerciseItem,
  'name' | 'targetReps' | 'targetWeight' | 'trackingMode' | 'targetDurationSeconds' | 'targetDistanceMeters' | 'phase'
>): ExerciseTrackingMode {
  if (ex.trackingMode) return ex.trackingMode
  if (ex.targetDurationSeconds != null && ex.targetDurationSeconds > 0) return 'timed'
  if (ex.targetDistanceMeters != null && ex.targetDistanceMeters > 0) return 'distance'

  const reps = String(ex.targetReps ?? '').trim()
  const weight = String(ex.targetWeight ?? '').trim()
  const name = String(ex.name ?? '').toLowerCase()

  if (/\b\d+(\.\d+)?\s*(km|m|meters?|metres|miles?)\b/i.test(reps) || /\b(run|row|cycle|bike|swim)\b/i.test(name) && /\b\d/.test(reps) && /km|m\b/i.test(reps)) {
    return 'distance'
  }

  if (
    /\b\d+(\s*[-–]\s*\d+)?\s*(min|mins|minutes?)\b/i.test(reps) ||
    /^\d+(\s*[-–]\s*\d+)?\s*s$/i.test(reps) ||
    /\b\d+\s*(sec|secs|seconds)\b/i.test(reps)
  ) {
    return 'timed'
  }

  if (weight || /@\s*[\d.]+\s*(kg|lbs?)/i.test(reps)) {
    return 'strength'
  }

  // Pure mobility / soft cues with no countable target
  if (
    (ex.phase === 'mobility' || ex.phase === 'cooldown') &&
    (!reps || /^(easy|light|as needed|comfortable|flow)$/i.test(reps))
  ) {
    return 'checkoff'
  }

  if (!reps || /amrap/i.test(reps)) {
    return 'reps_only'
  }

  // Has a numeric / range target without weight → bodyweight / count
  if (/\d/.test(reps)) return 'reps_only'

  return 'checkoff'
}

/** Parse duration prescription like "5 min", "3-5 min", "45s" into seconds (uses low end of ranges). */
export function parseDurationSeconds(targetReps: string): number | undefined {
  const text = String(targetReps ?? '').trim()
  if (!text) return undefined

  const minMatch = text.match(/^(\d+)(?:\s*[-–]\s*\d+)?\s*(min|mins|minutes?)\b/i)
  if (minMatch) return Number(minMatch[1]) * 60

  const secMatch = text.match(/^(\d+)(?:\s*[-–]\s*\d+)?\s*(s|sec|secs|seconds)?$/i)
  if (secMatch && (/s/i.test(secMatch[2] ?? '') || /s$/i.test(text))) {
    return Number(secMatch[1])
  }

  const secWord = text.match(/^(\d+)\s*(sec|secs|seconds)\b/i)
  if (secWord) return Number(secWord[1])

  return undefined
}

export function parseDistanceMeters(targetReps: string): number | undefined {
  const text = String(targetReps ?? '').trim()
  const km = text.match(/(\d+(?:\.\d+)?)\s*km\b/i)
  if (km) return Math.round(Number(km[1]) * 1000)
  const m = text.match(/(\d+(?:\.\d+)?)\s*(m|meters?|metres)\b/i)
  if (m) return Math.round(Number(m[1]))
  return undefined
}

/** Attach trackingMode (+ duration/distance targets) onto a freshly parsed exercise. */
export function withTrackingMeta(ex: TrackerExerciseItem): TrackerExerciseItem {
  const mode = inferTrackingMode(ex)
  const next: TrackerExerciseItem = { ...ex, trackingMode: mode }

  if (mode === 'timed' && next.targetDurationSeconds == null) {
    const seconds = parseDurationSeconds(ex.targetReps)
    if (seconds != null) next.targetDurationSeconds = seconds
  }
  if (mode === 'distance' && next.targetDistanceMeters == null) {
    const meters = parseDistanceMeters(ex.targetReps)
    if (meters != null) next.targetDistanceMeters = meters
  }
  return next
}

export function formatExerciseTarget(ex: TrackerExerciseItem): string {
  const mode = inferTrackingMode(ex)
  if (mode === 'timed') {
    if (ex.targetDurationSeconds != null) {
      if (ex.targetDurationSeconds >= 60 && ex.targetDurationSeconds % 60 === 0) {
        return `${ex.targetDurationSeconds / 60} min`
      }
      if (ex.targetDurationSeconds >= 60) {
        const m = Math.floor(ex.targetDurationSeconds / 60)
        const s = ex.targetDurationSeconds % 60
        return `${m}:${s.toString().padStart(2, '0')}`
      }
      return `${ex.targetDurationSeconds}s`
    }
    return ex.targetReps || 'Timed'
  }
  if (mode === 'distance') {
    if (ex.targetDistanceMeters != null) {
      if (ex.targetDistanceMeters >= 1000 && ex.targetDistanceMeters % 1000 === 0) {
        return `${ex.targetDistanceMeters / 1000} km`
      }
      return `${ex.targetDistanceMeters} m`
    }
    return ex.targetReps || 'Distance'
  }
  if (mode === 'checkoff') return 'Complete'
  const sets = ex.targetSets > 1 ? `${ex.targetSets} × ` : ''
  const weight = ex.targetWeight ? ` @ ${ex.targetWeight}` : ''
  return `${sets}${ex.targetReps}${weight}`.trim()
}

export function formatDurationInput(seconds: number | undefined): { minutes: string; seconds: string } {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return { minutes: '', seconds: '' }
  }
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return { minutes: String(m), seconds: String(s) }
}

export function durationFromParts(minutes: string, seconds: string): number | undefined {
  const m = Number(minutes)
  const s = Number(seconds)
  const hasM = minutes.trim() !== '' && Number.isFinite(m)
  const hasS = seconds.trim() !== '' && Number.isFinite(s)
  if (!hasM && !hasS) return undefined
  return Math.max(0, (hasM ? m : 0) * 60 + (hasS ? s : 0))
}

/** Used whenever a plan has no warm-up block — always keep one option available. */
export const DEFAULT_WARMUP_EXERCISES: TrackerExerciseItem[] = [
  withTrackingMeta({
    id: 'ex-warmup-default-cardio',
    name: 'Light cardio (walk / jog / bike)',
    targetSets: 1,
    targetReps: '3-5 min',
    phase: 'warmup',
    restSeconds: 30,
  }),
  withTrackingMeta({
    id: 'ex-warmup-default-arm-circles',
    name: 'Arm circles',
    targetSets: 1,
    targetReps: '10 each way',
    phase: 'warmup',
    restSeconds: 20,
  }),
  withTrackingMeta({
    id: 'ex-warmup-default-squats',
    name: 'Bodyweight squats',
    targetSets: 1,
    targetReps: '10',
    phase: 'warmup',
    restSeconds: 20,
  }),
  withTrackingMeta({
    id: 'ex-warmup-default-hips',
    name: 'Hip openers / cat-cows',
    targetSets: 1,
    targetReps: '8-10',
    phase: 'warmup',
    restSeconds: 20,
  }),
  withTrackingMeta({
    id: 'ex-warmup-default-glutes',
    name: 'Glute bridges',
    targetSets: 1,
    targetReps: '10',
    phase: 'warmup',
    restSeconds: 20,
  }),
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

export function isSetCompleteForMode(mode: ExerciseTrackingMode, set: ExerciseSetLog): boolean {
  if (set.completed) return true
  if (mode === 'checkoff') return Boolean(set.completed)
  if (mode === 'timed') return (set.durationSeconds ?? 0) > 0
  if (mode === 'distance') return (set.distanceMeters ?? 0) > 0
  if (mode === 'reps_only') return (set.reps ?? 0) > 0
  // strength: require reps; weight optional (bodyweight-ish strength prescriptions)
  return (set.reps ?? 0) > 0
}

export function areAllSetsComplete(ex: TrackerExerciseItem, sets: ExerciseSetLog[]): boolean {
  const mode = inferTrackingMode(ex)
  const target = sets.slice(0, ex.targetSets)
  if (target.length < ex.targetSets) return false
  if (mode === 'checkoff') {
    return target.every((s) => s.completed)
  }
  return target.every((s) => isSetCompleteForMode(mode, s))
}

export function buildExercisePatch(
  ex: TrackerExerciseItem,
  data: ExerciseCompletion | undefined,
  sets: ExerciseSetLog[]
): ExerciseCompletion {
  const mode = inferTrackingMode(ex)
  const normalized = sets.map((s) => {
    if (mode === 'checkoff') return s
    if (isSetCompleteForMode(mode, s) && !s.completed) return { ...s, completed: true }
    return s
  })
  const completed = areAllSetsComplete(ex, normalized)
  return { completed, sets: normalized, notes: data?.notes }
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

  const mode = inferTrackingMode(ex)
  if (mode === 'timed' || mode === 'distance' || mode === 'checkoff') return 45

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

export function exerciseSetVolume(mode: ExerciseTrackingMode, set: ExerciseSetLog): number {
  if (mode !== 'strength' && mode !== 'reps_only') return 0
  const reps = set.reps ?? 0
  const weight = set.weight ?? 0
  if (mode === 'reps_only') return reps
  return reps * weight
}
