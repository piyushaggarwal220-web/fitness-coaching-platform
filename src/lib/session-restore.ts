import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { isAdminRole } from '@/lib/roles'
import type { Coach, OnboardingProfile } from '@/types/database'

export const SESSION_RESTORE_MESSAGE = 'Restoring your session...'

export function isAuthNetworkError(error: { message?: string; name?: string } | string | null | undefined): boolean {
  const message =
    typeof error === 'string' ? error : `${error?.name ?? ''} ${error?.message ?? ''}`
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|authretryablefetch/i.test(
    message
  )
}

function authErrorText(error: { message?: string; code?: string; name?: string } | null | undefined): string {
  if (!error) return ''
  return `${error.code ?? ''} ${error.name ?? ''} ${error.message ?? ''}`
}

/** Supabase revokes the whole session when a second refresh reuses a rotated token. */
export function isRefreshReuseError(
  error: { message?: string; code?: string; name?: string } | null | undefined
): boolean {
  return /refresh_token_already_used|already used|too many concurrent token refresh|error_code.:?.conflict/i.test(
    authErrorText(error)
  )
}

export function isSessionLostMessage(message: string): boolean {
  return /jwt expired|invalid refresh token|auth session missing|refresh token not found|session expired|not authenticated|refresh_token_already_used/i.test(
    message
  )
}

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
/** Retries help after mobile app-switch when cookies/tokens are still settling. */
const SESSION_RETRY_DELAYS_MS = [0, 300, 800, 1500]
/** Short-lived client profile seed so post-onboarding navigations skip a stale incomplete read. */
const CLIENT_SESSION_CACHE_TTL_MS = 60_000
/** Deduplicate concurrent restores and reuse a warm result across portal sections. */
const SESSION_CACHE_TTL_MS = 15_000

type CachedClientSession = {
  user: SessionUser
  profile: OnboardingProfile
  cachedAt: number
}

let clientSessionCache: CachedClientSession | null = null
let inFlightRestore: Promise<SessionRestoreResult> | null = null
let cachedRestore: { result: SessionRestoreResult; at: number } | null = null
let refreshInFlight: Promise<{ user: SessionUser | null; reuseConflict: boolean }> | null = null

/** Drop any in-memory auth/profile seed (call on login + logout). */
export function invalidateSessionCache(): void {
  clientSessionCache = null
  cachedRestore = null
  inFlightRestore = null
}

/**
 * Seed the in-memory client session after onboarding completion is confirmed.
 * Prevents a race where the next restore still reads onboarding_complete=false.
 */
export function seedAuthenticatedClientSession(
  user: SessionUser,
  profile: OnboardingProfile
): void {
  clientSessionCache = {
    user: { id: user.id, email: user.email },
    profile,
    cachedAt: Date.now(),
  }
  cachedRestore = {
    at: Date.now(),
    result: {
      status: 'authenticated',
      user,
      role: 'client',
      profile,
      coach: null,
    },
  }
}

function readClientSessionCache(userId: string): OnboardingProfile | null {
  if (!clientSessionCache) return null
  if (clientSessionCache.user.id !== userId) {
    clientSessionCache = null
    return null
  }
  if (Date.now() - clientSessionCache.cachedAt > CLIENT_SESSION_CACHE_TTL_MS) {
    clientSessionCache = null
    return null
  }
  return clientSessionCache.profile
}

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

/**
 * One refresh at a time in this tab. Onboarding, keepalive, and the camera
 * return all used to refresh together; the second call reused the rotated
 * token and Supabase signed the client out.
 */
export async function refreshAuthSessionOnce(
  supabase: SupabaseClient
): Promise<{ user: SessionUser | null; reuseConflict: boolean }> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (data?.user && !error) {
      return {
        user: { id: data.user.id, email: data.user.email },
        reuseConflict: false,
      }
    }

    if (isRefreshReuseError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        return { user: { id: user.id, email: user.email }, reuseConflict: false }
      }
      const localUser = await userFromLocalSession(supabase)
      if (localUser) return { user: localUser, reuseConflict: false }
      return { user: null, reuseConflict: true }
    }

    return { user: null, reuseConflict: false }
  })().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

/** Refresh only when the access token is close to expiry. Opening the camera should not rotate a healthy token. */
export async function refreshAuthSessionIfExpiring(
  supabase: SupabaseClient,
  skewMs = 120_000
): Promise<{ user: SessionUser | null; reuseConflict: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const expiresAtMs = (session?.expires_at ?? 0) * 1000
  if (session?.user?.id && expiresAtMs - Date.now() > skewMs) {
    return {
      user: { id: session.user.id, email: session.user.email },
      reuseConflict: false,
    }
  }
  return refreshAuthSessionOnce(supabase)
}

/** Ensure the Supabase client has a valid, refreshed auth session. */
export async function ensureAuthSession(
  supabase: SupabaseClient
): Promise<{ user: SessionUser | null; refreshed: boolean }> {
  let sawRefresh = false
  let triedSameOrigin = false

  for (let attempt = 0; attempt < SESSION_RETRY_DELAYS_MS.length; attempt++) {
    if (SESSION_RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, SESSION_RETRY_DELAYS_MS[attempt]))
    }

    const { data: { user }, error } = await supabase.auth.getUser()
    if (user && !error) {
      logSessionRestore('session_found', {
        userId: user.id,
        attempt,
        refreshed: sawRefresh,
      })
      return {
        user: { id: user.id, email: user.email },
        refreshed: sawRefresh,
      }
    }

    if (isAuthNetworkError(error)) {
      const localUser = await userFromLocalSession(supabase)
      if (localUser) {
        logSessionRestore('session_found', {
          userId: localUser.id,
          attempt,
          fromLocalSession: true,
        })
        return { user: localUser, refreshed: sawRefresh }
      }
    }

    if (!triedSameOrigin) {
      triedSameOrigin = true
      const viaApi = await userFromSameOriginSession()
      if (viaApi) {
        logSessionRestore('session_found', {
          userId: viaApi.id,
          attempt,
          fromSameOrigin: true,
        })
        return { user: viaApi, refreshed: sawRefresh }
      }
    }

    const refreshedSession = await refreshAuthSessionOnce(supabase)
    if (refreshedSession.user) {
      sawRefresh = true
      logSessionRestore('session_refreshed', { userId: refreshedSession.user.id, attempt })
      return {
        user: refreshedSession.user,
        refreshed: true,
      }
    }
    if (refreshedSession.reuseConflict) break

    const { data: { user: retryUser } } = await supabase.auth.getUser()
    if (retryUser) {
      sawRefresh = true
      logSessionRestore('session_found', {
        userId: retryUser.id,
        afterRefreshRetry: true,
        attempt,
      })
      return { user: { id: retryUser.id, email: retryUser.email }, refreshed: true }
    }
  }

  logSessionRestore('session_missing', {})
  return { user: null, refreshed: false }
}

async function userFromLocalSession(supabase: SupabaseClient): Promise<SessionUser | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user?.id) return null
  return { id: user.id, email: user.email }
}

async function userFromSameOriginSession(): Promise<SessionUser | null> {
  const payload = await fetchSameOriginAuthSession()
  return payload?.user ?? null
}

async function fetchSameOriginAuthSession(): Promise<{
  user: SessionUser
  profile: OnboardingProfile | null
} | null> {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json().catch(() => null)) as {
      user?: { id?: string; email?: string | null }
      profile?: OnboardingProfile | null
    } | null
    if (!data?.user?.id) return null
    return {
      user: { id: data.user.id, email: data.user.email ?? undefined },
      profile: data.profile ?? null,
    }
  } catch {
    return null
  }
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
    if (isAuthNetworkError(error)) {
      const viaApi = await fetchSameOriginAuthSession()
      if (viaApi?.profile && viaApi.user.id === userId) {
        logSessionRestore('profile_found', {
          userId,
          fromSameOrigin: true,
          onboardingComplete: isOnboardingComplete(viaApi.profile),
        })
        return { profile: viaApi.profile, error: null }
      }
    }
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

export type RoleDetectionResult = {
  role: ResolvedRole
  error: string | null
  definitive: boolean
}

export function resolveDetectedRole(input: {
  profile: Pick<OnboardingProfile, 'role'> | null
  profileError: string | null
  coach: Coach | null
  coachError: string | null
}): RoleDetectionResult {
  const { profile, profileError, coach, coachError } = input
  if (profile && isAdminRole(profile.role)) {
    return { role: 'admin', error: null, definitive: true }
  }
  if (profile?.role === 'coach') {
    return { role: 'coach', error: coachError, definitive: true }
  }
  if (coach) {
    return { role: 'coach', error: null, definitive: true }
  }
  if (profileError || coachError) {
    return {
      role: 'client',
      error: profileError ?? coachError,
      definitive: false,
    }
  }
  return { role: 'client', error: null, definitive: true }
}

export async function detectUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<RoleDetectionResult> {
  const [{ profile, error: profileError }, { coach, error: coachError }] = await Promise.all([
    fetchAdminProfile(supabase, userId),
    fetchCoachRecord(supabase, userId),
  ])

  const result = resolveDetectedRole({ profile, profileError, coach, coachError })
  logSessionRestore('role_resolved', { userId, role: result.role })
  return result
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

async function restoreSessionUncached(
  supabase: SupabaseClient
): Promise<SessionRestoreResult> {
  const { user } = await ensureAuthSession(supabase)
  if (!user) {
    invalidateSessionCache()
    return { status: 'unauthenticated' }
  }

  const seededProfile = readClientSessionCache(user.id)
  if (seededProfile && isOnboardingComplete(seededProfile)) {
    logSessionRestore('onboarding_complete', { userId: user.id, fromCache: true })
    return {
      status: 'authenticated',
      user,
      role: 'client',
      profile: seededProfile,
      coach: null,
    }
  }

  // Single parallel role lookup — avoid a second coach/admin round-trip below.
  const [{ profile: roleProfile, error: profileError }, { coach, error: coachError }] =
    await Promise.all([
      fetchAdminProfile(supabase, user.id),
      fetchCoachRecord(supabase, user.id),
    ])

  const detection = resolveDetectedRole({
    profile: roleProfile,
    profileError,
    coach,
    coachError,
  })
  const role = detection.role
  logSessionRestore('role_resolved', { userId: user.id, role })

  if (detection.error && !detection.definitive) {
    logSessionRestore('profile_unavailable', {
      userId: user.id,
      role,
      error: detection.error,
    })
    return { status: 'profile_unavailable', user, role, profileError: detection.error }
  }

  if (role === 'coach') {
    if (coach) {
      return { status: 'authenticated', user, role, profile: null, coach }
    }
    if (coachError) {
      logSessionRestore('profile_unavailable', { userId: user.id, role, error: coachError })
      return { status: 'profile_unavailable', user, role, profileError: coachError }
    }
    return {
      status: 'profile_unavailable',
      user,
      role,
      profileError: 'Coach profile is temporarily unavailable.',
    }
  }

  if (role === 'admin') {
    if (roleProfile && isAdminRole(roleProfile.role)) {
      return {
        status: 'authenticated',
        user,
        role,
        profile: roleProfile as OnboardingProfile,
        coach: null,
      }
    }
    if (profileError) {
      logSessionRestore('profile_unavailable', { userId: user.id, role, error: profileError })
      return { status: 'profile_unavailable', user, role, profileError }
    }
    return { status: 'unauthenticated' }
  }

  const { profile, error } = await fetchClientProfile(supabase, user.id)
  if (profile) {
    if (isOnboardingComplete(profile)) {
      logSessionRestore('onboarding_complete', { userId: user.id })
      seedAuthenticatedClientSession(user, profile)
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

export async function restoreSession(
  supabase: SupabaseClient
): Promise<SessionRestoreResult> {
  const now = Date.now()
  if (cachedRestore && now - cachedRestore.at < SESSION_CACHE_TTL_MS) {
    return cachedRestore.result
  }

  if (inFlightRestore) {
    return inFlightRestore
  }

  inFlightRestore = restoreSessionUncached(supabase)
    .then((result) => {
      if (result.status === 'authenticated') {
        cachedRestore = { result, at: Date.now() }
      } else if (result.status === 'unauthenticated') {
        cachedRestore = null
      }
      return result
    })
    .finally(() => {
      inFlightRestore = null
    })

  return inFlightRestore
}

/** Drop a cached client profile so the next restore picks up payment/onboarding changes. */
export function invalidateClientSessionCache(): void {
  clientSessionCache = null
  if (cachedRestore?.result.status === 'authenticated' && cachedRestore.result.role === 'client') {
    cachedRestore = null
  }
}
