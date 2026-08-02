import type { Profile } from '@/types/database'

export type AccessSource = 'purchase' | 'admin_trial' | 'enrollment_code'

export type EntitlementProfile = Pick<Profile, 'payment_confirmed' | 'access_source' | 'subscription_expires_at'>

/** Clients need at least this many days left to receive a new or edited coaching plan. */
export const MIN_DAYS_REQUIRED_FOR_PLAN_CHANGE = 7

/** Whether a client has active platform access (paid or admin-granted trial). */
export function hasClientEntitlement(profile: EntitlementProfile | null | undefined): boolean {
  if (!profile) return false

  if (profile.access_source === 'admin_trial') return true

  if (profile.payment_confirmed !== true) return false

  if (profile.subscription_expires_at) {
    const expires = new Date(profile.subscription_expires_at).getTime()
    if (Number.isFinite(expires) && expires < Date.now()) return false
  }

  return true
}

export function isAdminTrialClient(profile: EntitlementProfile | null | undefined): boolean {
  return profile?.access_source === 'admin_trial'
}

/** Whole days remaining until subscription_expires_at (null = no expiry / unknown). */
export function subscriptionDaysRemaining(
  profile: Pick<EntitlementProfile, 'subscription_expires_at' | 'access_source'> | null | undefined,
  now = Date.now()
): number | null {
  if (!profile) return null
  if (profile.access_source === 'admin_trial') return null
  if (!profile.subscription_expires_at) return null
  const expires = new Date(profile.subscription_expires_at).getTime()
  if (!Number.isFinite(expires)) return null
  return (expires - now) / (24 * 60 * 60 * 1000)
}

/**
 * Block new/edited plan delivery when the client has under 7 days of access left.
 * Admin trials (no expiry) always pass. Profiles without an expiry also pass.
 */
export function assertClientCanReceivePlanChanges(
  profile: EntitlementProfile | null | undefined,
  now = Date.now()
): { ok: true } | { ok: false; error: string; daysRemaining: number } {
  if (!profile) {
    return {
      ok: false,
      error: 'Client profile could not be verified for plan changes.',
      daysRemaining: 0,
    }
  }

  if (profile.access_source === 'admin_trial') {
    return { ok: true }
  }

  const days = subscriptionDaysRemaining(profile, now)
  if (days == null) {
    return { ok: true }
  }

  if (days < MIN_DAYS_REQUIRED_FOR_PLAN_CHANGE) {
    const whole = Math.max(0, Math.floor(days))
    return {
      ok: false,
      error:
        whole <= 0
          ? 'This client’s subscription has ended or has less than 7 days left. Renew before creating or editing a plan.'
          : `This client has only ${whole} day${whole === 1 ? '' : 's'} left on their subscription. Renew to at least 7 days before creating or editing a plan.`,
      daysRemaining: whole,
    }
  }

  return { ok: true }
}
