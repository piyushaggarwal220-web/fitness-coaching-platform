import type { SupabaseClient } from '@supabase/supabase-js'

/** Default coach client capacity used for assignment and dashboard display. */
export const DEFAULT_COACH_HARD_CAP = 1000

/**
 * Resolve the effective coach capacity for UI and assignment.
 * Legacy demo/default caps (100, 500, null) map to the current platform target of 1000.
 * Explicit caps above 1000 are preserved.
 */
export function resolveCoachHardCap(hardCap: number | null | undefined): number {
  if (typeof hardCap === 'number' && Number.isFinite(hardCap) && hardCap > DEFAULT_COACH_HARD_CAP) {
    return hardCap
  }
  return DEFAULT_COACH_HARD_CAP
}

/** Persist capacity for coaches still below the platform target. */
export async function raiseCoachHardCapsBelowTarget(
  admin: SupabaseClient,
  target = DEFAULT_COACH_HARD_CAP
): Promise<{ updated: number; hardCap: number }> {
  const { data: coaches, error: listError } = await admin.from('coaches').select('id, hard_cap')
  if (listError) throw new Error(listError.message)

  const ids = (coaches ?? [])
    .filter((coach) => coach.hard_cap == null || coach.hard_cap < target)
    .map((coach) => coach.id)

  if (ids.length === 0) return { updated: 0, hardCap: target }

  const { error } = await admin.from('coaches').update({ hard_cap: target }).in('id', ids)
  if (error) throw new Error(error.message)

  return { updated: ids.length, hardCap: target }
}
