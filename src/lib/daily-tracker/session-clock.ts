import type { TrackerCompletion } from './types'

/** Matches the workout screen cap (4 hours). */
export const MAX_WORKOUT_SESSION_SECONDS = 4 * 60 * 60

type WorkoutSession = NonNullable<TrackerCompletion['workoutSession']>

/**
 * Seconds between a session start and an end instant.
 * Returns null when the start cannot be read.
 */
export function workoutSessionSpanSeconds(
  startedAt: string | undefined,
  endMs: number
): number | null {
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  if (!Number.isFinite(start) || endMs <= start) return null
  return Math.min(MAX_WORKOUT_SESSION_SECONDS, Math.floor((endMs - start) / 1000))
}

/**
 * Duration written when the client saves a workout.
 * A paused timer keeps the frozen elapsed time.
 * Otherwise the wall-clock start wins when the on-screen clock froze
 * (phone sleep, killed timer) and only a short duration was going to be stored.
 */
export function resolveWorkoutSaveDurationSeconds(input: {
  nowMs: number
  localElapsedSeconds: number
  userPaused: boolean
  session?: WorkoutSession | null
}): number {
  const local = Math.max(0, Math.floor(input.localElapsedSeconds))
  const stored = Math.max(0, Math.floor(input.session?.durationSeconds ?? 0))
  const paused = input.userPaused || input.session?.paused === true
  const floor = Math.min(MAX_WORKOUT_SESSION_SECONDS, Math.max(local, stored))
  if (paused) return floor

  const span = workoutSessionSpanSeconds(input.session?.startedAt, input.nowMs)
  if (span == null) return Math.min(MAX_WORKOUT_SESSION_SECONDS, Math.max(0, local))
  return Math.min(MAX_WORKOUT_SESSION_SECONDS, Math.max(floor, span))
}

/**
 * What the timer should show for an already saved session.
 * Uses savedAt − startedAt when the stored duration is the frozen short clock,
 * and does not keep counting after save.
 */
export function displayedSavedDurationSeconds(
  session: WorkoutSession | null | undefined,
  localElapsedSeconds: number
): number {
  const local = Math.max(0, Math.floor(localElapsedSeconds))
  const stored = Math.max(0, Math.floor(session?.durationSeconds ?? 0))
  if (!session || session.paused) {
    return Math.min(MAX_WORKOUT_SESSION_SECONDS, Math.max(local, stored))
  }
  const end = session.savedAt ? Date.parse(session.savedAt) : NaN
  const span = Number.isFinite(end) ? workoutSessionSpanSeconds(session.startedAt, end) : null
  return Math.min(MAX_WORKOUT_SESSION_SECONDS, Math.max(local, stored, span ?? 0))
}

/**
 * Repair a saved or in-progress session whose duration is stuck far behind startedAt.
 * Paused sessions are left alone. Saved sessions are measured to savedAt, not "now",
 * so later set logs do not stretch the workout.
 */
export function reconcileWorkoutSessionDuration(
  session: WorkoutSession | null | undefined,
  nowMs: number
): WorkoutSession | null | undefined {
  if (!session || session.paused) return session
  const start = session.startedAt ? Date.parse(session.startedAt) : NaN
  if (!Number.isFinite(start)) return session

  const savedAt = session.savedAt ? Date.parse(session.savedAt) : NaN
  const end = session.status === 'saved' && Number.isFinite(savedAt) ? savedAt : nowMs
  const span = workoutSessionSpanSeconds(session.startedAt, end)
  if (span == null) return session

  const stored = Math.max(0, Math.floor(session.durationSeconds ?? 0))
  if (span < stored + 90) return session

  return { ...session, durationSeconds: span }
}
