import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  redirectToLogin,
  restoreSession,
} from '@/lib/session-restore'
import type { Coach } from '@/types/database'
import type { SessionRestoreResult } from '@/lib/session-restore'

export type CoachSessionDecision =
  | { action: 'allow'; coach: Coach }
  | { action: 'retry'; message: string }
  | { action: 'redirect'; reason: 'session_expired' | 'not_a_coach' }

export function decideCoachSession(restored: SessionRestoreResult): CoachSessionDecision {
  if (restored.status === 'unauthenticated') {
    return { action: 'redirect', reason: 'session_expired' }
  }
  if (restored.status === 'profile_unavailable') {
    return { action: 'retry', message: restored.profileError }
  }
  if (restored.role !== 'coach') {
    return { action: 'redirect', reason: 'not_a_coach' }
  }
  if (restored.coach) return { action: 'allow', coach: restored.coach }
  return { action: 'retry', message: 'Coach profile is temporarily unavailable.' }
}

/** Returns the coach, redirects only on definitive denial, or returns null for retryable lookup failures. */
export async function requireCoach(
  supabase: SupabaseClient,
  router: AppRouterInstance
): Promise<Coach | null> {
  const restored = await restoreSession(supabase)
  const decision = decideCoachSession(restored)

  if (decision.action === 'redirect') {
    redirectToLogin(router, 'coach', decision.reason)
    return null
  }
  if (decision.action === 'retry') {
    return null
  }
  return decision.coach
}
