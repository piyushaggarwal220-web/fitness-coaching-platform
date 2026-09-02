import type { SupabaseClient } from '@supabase/supabase-js'
import { assignCoachToClient } from '@/lib/admin/assign-coach'
import { shouldAutoAssignCoach } from '@/lib/config'
import { coachAcceptsAutoAssignment } from '@/lib/coach-delivery-policy'
import { isTrialClientHiddenFromCoaches } from '@/lib/coach-roster-visibility'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Auto-assign the least-loaded active coach to a client.
 * Used in development mode and after redemption/entitlement grant.
 * Manual-delivery coaches (e.g. Piyush) are never chosen here.
 */
export async function autoAssignCoachToClient(
  clientId: string,
  supabase?: SupabaseClient
): Promise<{ coachId: string | null; error: string | null }> {
  const db = supabase ?? createAdminClient()

  const { data: profile } = await db
    .from('profiles')
    .select('coach_id, email, access_source')
    .eq('id', clientId)
    .maybeSingle()

  if (profile?.coach_id) {
    return { coachId: profile.coach_id, error: null }
  }

  if (isTrialClientHiddenFromCoaches(profile ?? {})) {
    return { coachId: null, error: null }
  }

  const { data: coaches, error: coachesError } = await db
    .from('coaches')
    .select('id, hard_cap')

  if (coachesError) return { coachId: null, error: coachesError.message }

  const autoCoaches = (coaches ?? []).filter((coach) => coachAcceptsAutoAssignment(coach.id))
  if (!autoCoaches.length) return { coachId: null, error: 'No coaches available for assignment.' }

  const coachIds = autoCoaches.map((c) => c.id)
  const { data: counts } = await db
    .from('profiles')
    .select('coach_id, email, access_source')
    .in('coach_id', coachIds)
    .eq('role', 'client')

  const loadMap = new Map<string, number>()
  for (const id of coachIds) loadMap.set(id, 0)
  for (const row of counts ?? []) {
    if (!row.coach_id || isTrialClientHiddenFromCoaches(row)) continue
    loadMap.set(row.coach_id, (loadMap.get(row.coach_id) ?? 0) + 1)
  }

  let bestCoachId: string | null = null
  let lowestLoad = Infinity

  for (const coach of autoCoaches) {
    const load = loadMap.get(coach.id) ?? 0
    const cap = coach.hard_cap ?? 999
    if (load < cap && load < lowestLoad) {
      lowestLoad = load
      bestCoachId = coach.id
    }
  }

  if (!bestCoachId) {
    return { coachId: null, error: 'All auto-assign coaches are at capacity.' }
  }

  const { error } = await assignCoachToClient(db, clientId, bestCoachId)
  if (error) return { coachId: null, error }

  return { coachId: bestCoachId, error: null }
}

/** Assign coach if development mode or explicitly requested. */
export async function maybeAutoAssignCoach(
  clientId: string,
  supabase?: SupabaseClient
): Promise<{ coachId: string | null; error: string | null }> {
  if (!shouldAutoAssignCoach()) return { coachId: null, error: null }
  return autoAssignCoachToClient(clientId, supabase)
}
