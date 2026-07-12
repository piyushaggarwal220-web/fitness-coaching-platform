import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { isAdminRole } from '@/lib/roles'
import type { Coach, OnboardingProfile } from '@/types/database'

export const SESSION_RESTORE_MESSAGE = 'Restoring your session...'

export type ResolvedRole = 'client' | 'coach' | 'admin'

export type SessionUser = { id: string; email?: string }

export type SessionRestoreSuccess = {
  status: 'authenticated'
  user: SessionUser
  role: ResolvedRole
  profile: OnboardingProfile | null
  coach: Coach | null
  profileError?: string
}

export type SessionRestoreFailure =
  | { status: 'unauthenticated' }
  | {
      status: 'profile_unavailable'
      user: SessionUser
      role: ResolvedRole
      profileError: string
    }

export type SessionRestoreResult = SessionRestoreSuccess | SessionRestoreFailure

const PROFILE_FETCH_RETRY_DELAYS_MS = [0, 200, 500, 1000, 1500, 2500]
const COACH_FETCH_RETRY_DELAYS_MS = [0, 200, 500, 1000, 1500]

type SessionRestoreLogEvent =
  | 'session_found'
  | 'session_refreshed'
  | 'session_missing'
  | 'role_resolved'
  | 'profile_found'
  | 'profile_missing'
  | 'profile_unavailable'
  | 'coach_found'
  | 'coach_missing'
  | 'redirect'
  | 'onboarding_complete'

function logSessionRestore(
  event: SessionRestoreLogEvent,
  details: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === 'production') return
  console.info(`[session-restore] ${event}`, details)
}

/** Ensure the Supabase client has a valid, refreshed auth session. */
export async function ensureAuthSession(
  supabase: SupabaseClient
): Promise<{ user: SessionUser | null; refreshed: boolean }> {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (user && !error) {
    logSessionRestore('session_found', { userId: user.id })
    return { user: { id: user.id, email: user.email }, refreshed: false }
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshData?.user && !refreshError) {
    logSessionRestore('session_refreshed', { userId: refreshData.user.id })
    return {
      user: { id: refreshData.user.id, email: refreshData.user.email },
      refreshed: true,
    }
  }

  const { data: { user: retryUser } } = await supabase.auth.getUser()
  if (retryUser) {
    logSessionRestore('session_found', { userId: retryUser.id, afterRefreshRetry: true })
    return { user: { id: retryUser.id, email: retryUser.email }, refreshed: true }
  }

  logSessionRestore('session_missing', {})
  return { user: null, refreshed: false }
}

async function fetchWithRetry<T>(
  delaysMs: number[],
  fetcher: () => Promise<{ data: T | null; error: string | null }>
): Promise<{ data: T | null; error: string | null }> {
  let lastError: string | null = null

  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    if (delaysMs[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]))
    }

    const result = await fetcher()
    if (!result.error) {
      return result
    }
    lastError = result.error
  }

  return { data: null, error: lastError ?? 'Request failed' }
}

export async function fetchClientProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ profile: OnboardingProfile | null; error: string | null }> {
  const { data, error } = await fetchWithRetry(PROFILE_FETCH_RETRY_DELAYS_MS, async () => {
    const { data: row, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (queryError) {
      return { data: null, error: queryError.message }
    }

    return { data: (row as OnboardingProfile | null) ?? null, error: null }
  })

  if (data) {
    logSessionRestore('profile_found', {
      userId,
      onboardingComplete: isOnboardingComplete(data),
      onboardingCompletedAt: data.onboarding_completed_at ?? null,
    })
  } else if (error) {
    logSessionRestore('profile_missing', { userId, error })
  }

  return { profile: data, error }
}

export async function fetchCoachRecord(
  supabase: SupabaseClient,
  userId: string
): Promise<{ coach: Coach | null; error: string | null }> {
  const { data, error } = await fetchWithRetry(COACH_FETCH_RETRY_DELAYS_MS, async () => {
    const { data: row, error: queryError } = await supabase
      .from('coaches')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (queryError) {
      return { data: null, error: queryError.message }
    }

    return { data: (row as Coach | null) ?? null, error: null }
  })

  if (data) {
    logSessionRestore('coach_found', { userId, coachId: data.id })
  } else if (error) {
    logSessionRestore('coach_missing', { userId, error })
  }

  return { coach: data, error }
}

export async function fetchAdminProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  profile: Pick<OnboardingProfile, 'id' | 'name' | 'email' | 'role'> | null
  error: string | null
}> {
  const { data, error } = await fetchWithRetry(PROFILE_FETCH_RETRY_DELAYS_MS, async () => {
    const { data: row, error: queryError } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .eq('id', userId)
      .maybeSingle()

    if (queryError) {
      return { data: null, error: queryError.message }
    }

    return {
      data: (row as Pick<OnboardingProfile, 'id' | 'name' | 'email' | 'role'> | null) ?? null,
      error: null,
    }
  })

  return { profile: data, error }
}

export function isOnboardingComplete(
  profile: Pick<OnboardingProfile, 'onboarding_complete' | 'onboarding_completed_at'> | null
): boolean {
  if (!profile) return false
  if (profile.onboarding_complete === true) return true
  if (profile.onboarding_completed_at) return true
  return false
}

/**
 * Only true when profile loaded successfully and completion is definitively absent.
 * Never treat null profile or ambiguous flags as "needs onboarding".
 */
export function isDefinitivelyOnboardingIncomplete(
  profile: Pick<OnboardingProfile, 'onboarding_complete' | 'onboarding_completed_at'> | null
): boolean {
  if (!profile) return false
  if (isOnboardingComplete(profile)) return false
  return profile.onboarding_complete !== true && !profile.onboarding_completed_at
}

export async function detectUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<ResolvedRole> {
  const [{ profile }, { coach }] = await Promise.all([
    fetchAdminProfile(supabase, userId),
    fetchCoachRecord(supabase, userId),
  ])

  if (profile && isAdminRole(profile.role)) {
    logSessionRestore('role_resolved', { userId, role: 'admin' })
    return 'admin'
  }

  if (coach) {
    logSessionRestore('role_resolved', { userId, role: 'coach' })
    return 'coach'
  }

  logSessionRestore('role_resolved', { userId, role: 'client' })
  return 'client'
}

export function getRoleHomePath(role: ResolvedRole): string {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'coach':
      return '/coach/dashboard'
    default:
      return '/dashboard'
  }
}

export function getLoginPathForRole(role: ResolvedRole): string {
  switch (role) {
    case 'admin':
      return '/admin/login'
    case 'coach':
      return '/coach/login'
    default:
      return '/login'
  }
}

function buildExpiredLoginRedirect(): string {
  const redirect =
    typeof window !== 'undefined'
      ? encodeURIComponent(window.location.pathname + window.location.search)
      : encodeURIComponent('/dashboard')
  return `/login?expired=1&redirect=${redirect}`
}

export function redirectToLogin(
  router: AppRouterInstance,
  role: ResolvedRole = 'client',
  reason: string
): void {
  const destination =
    role === 'client' ? buildExpiredLoginRedirect() : getLoginPathForRole(role)
  logSessionRestore('redirect', { destination, reason, role })
  router.push(destination)
}

export async function restoreSession(
  supabase: SupabaseClient
): Promise<SessionRestoreResult> {
  const { user } = await ensureAuthSession(supabase)
  if (!user) {
    return { status: 'unauthenticated' }
  }

  const role = await detectUserRole(supabase, user.id)

  if (role === 'coach') {
    const { coach, error } = await fetchCoachRecord(supabase, user.id)
    if (coach) {
      return { status: 'authenticated', user, role, profile: null, coach }
    }
    if (error) {
      logSessionRestore('profile_unavailable', { userId: user.id, role, error })
      return { status: 'profile_unavailable', user, role, profileError: error }
    }
    return { status: 'unauthenticated' }
  }

  if (role === 'admin') {
    const { profile, error } = await fetchAdminProfile(supabase, user.id)
    if (profile && isAdminRole(profile.role)) {
      return {
        status: 'authenticated',
        user,
        role,
        profile: profile as OnboardingProfile,
        coach: null,
      }
    }
    if (error) {
      logSessionRestore('profile_unavailable', { userId: user.id, role, error })
      return { status: 'profile_unavailable', user, role, profileError: error }
    }
    return { status: 'unauthenticated' }
  }

  const { profile, error } = await fetchClientProfile(supabase, user.id)
  if (profile) {
    if (isOnboardingComplete(profile)) {
      logSessionRestore('onboarding_complete', { userId: user.id })
    }
    return { status: 'authenticated', user, role: 'client', profile, coach: null }
  }

  if (error) {
    logSessionRestore('profile_unavailable', { userId: user.id, role: 'client', error })
    return { status: 'profile_unavailable', user, role: 'client', profileError: error }
  }

  return {
    status: 'authenticated',
    user,
    role: 'client',
    profile: null,
    coach: null,
  }
}
