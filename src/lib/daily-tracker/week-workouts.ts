import type { TrackerCompletion } from '@/lib/daily-tracker/types'

/** One logged workout day: the session was saved, or at least one exercise was marked done. */
export function trackerDayCountsAsWorkout(
  completion: TrackerCompletion | null | undefined
): boolean {
  if (!completion) return false
  if (completion.workoutSession?.status === 'saved') return true
  return Object.values(completion.exercises ?? {}).some((row) => row?.completed === true)
}
