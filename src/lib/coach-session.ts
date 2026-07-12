import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  fetchCoachRecord,
  redirectToLogin,
  restoreSession,
} from '@/lib/session-restore'
import type { Coach } from '@/types/database'

/** Returns the logged-in coach row or redirects and returns null. */
export async function requireCoach(
  supabase: SupabaseClient,
  router: AppRouterInstance
): Promise<Coach | null> {
  const restored = await restoreSession(supabase)

  if (restored.status === 'unauthenticated') {
    redirectToLogin(router, 'coach', 'session_expired')
    return null
  }

  if (restored.role !== 'coach') {
    redirectToLogin(router, 'coach', 'not_a_coach')
    return null
  }

  if (restored.status === 'profile_unavailable') {
    return null
  }

  if (restored.coach) {
    return restored.coach
  }

  const { coach, error } = await fetchCoachRecord(supabase, restored.user.id)
  if (coach) {
    return coach
  }

  if (error) {
    return null
  }

  redirectToLogin(router, 'coach', 'coach_record_missing')
  return null
}
