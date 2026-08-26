import { createAdminClient } from '@/lib/supabase/admin'
import type { ExerciseFormResult } from '@/lib/exercise-form/lookup'
import { normalizeExerciseQuery } from '@/lib/exercise-form/normalize'

/** Unique form videos each person can play without buying the library. Lifetime, per account. */
export const FREE_EXERCISE_FORM_LIFETIME_CAP = 3

export type FreeExerciseFormAccess = {
  allowed: boolean
  entitled: boolean
  used: number
  remaining: number
  claimed: boolean
}

export function exerciseFormUnlockKey(
  result: Pick<ExerciseFormResult, 'found' | 'exerciseId' | 'query' | 'name'>
): string | null {
  if (!result.found) return null
  if (result.exerciseId != null && Number.isFinite(result.exerciseId)) {
    return `mw:${result.exerciseId}`
  }
  const query = normalizeExerciseQuery(result.name || result.query)
  return query ? `q:${query}` : null
}

function parseAccess(raw: unknown): FreeExerciseFormAccess {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const used = Number(row.used ?? 0)
  const remaining = Number(row.remaining ?? FREE_EXERCISE_FORM_LIFETIME_CAP)
  return {
    allowed: row.allowed === true,
    entitled: row.entitled === true,
    used: Number.isFinite(used) ? used : 0,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    claimed: row.claimed === true,
  }
}

export async function claimFreeExerciseForm(
  userId: string,
  exerciseKey: string
): Promise<FreeExerciseFormAccess> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('claim_free_exercise_form', {
    p_user_id: userId,
    p_exercise_key: exerciseKey,
  })
  if (error) {
    throw new Error(error.message || 'Could not check free form videos')
  }
  return parseAccess(data)
}

export async function canPlayFreeExerciseForm(
  userId: string,
  exerciseKey: string
): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('exercise_form_free_unlocks')
    .select('exercise_key')
    .eq('user_id', userId)
    .eq('exercise_key', exerciseKey)
    .maybeSingle()
  return Boolean(data?.exercise_key)
}
