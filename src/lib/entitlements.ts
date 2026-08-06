import type { Profile } from '@/types/database'

export type AccessSource = 'purchase' | 'admin_trial' | 'enrollment_code'

export type EntitlementProfile = Pick<Profile, 'payment_confirmed' | 'access_source' | 'subscription_expires_at'>

/** Clients need at least this many calendar days left to receive a new or edited coaching plan. */
export const MIN_DAYS_REQUIRED_FOR_PLAN_CHANGE = 1

/** Show renew CTAs / send soft reminders when this many days (or fewer) remain. */
export const MEMBERSHIP_RENEWAL_WARNING_DAYS = 7

/**
 * After subscription_expires_at, clients keep access this many days so they can renew
 * in-app before hard revoke / paywall.
 */
export const MEMBERSHIP_GRACE_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** Whether a client has active platform access (paid, code, or admin-granted trial). */
export function hasClientEntitlement(profile: EntitlementProfile | null | undefined, now = Date.now()): boolean {
  if (!profile) return false

  if (profile.access_source === 'admin_trial') return true

  if (profile.payment_confirmed !== true) return false

  if (profile.subscription_expires_at) {
    const expires = new Date(profile.subscription_expires_at).getTime()
    if (Number.isFinite(expires) && expires + MEMBERSHIP_GRACE_DAYS * DAY_MS < now) {
      return false
    }
  }

  return true
}

export function isAdminTrialClient(profile: EntitlementProfile | null | undefined): boolean {
  return profile?.access_source === 'admin_trial'
}

/**
 * Returning members (paid / enrollment / expired seat) should hit the hard paywall page
 * once entitlement is gone (after grace). Brand-new unpaid accounts go to normal checkout.
 */
export function getClientPaymentGatePath(
  profile: Pick<EntitlementProfile, 'access_source' | 'subscription_expires_at'> | null | undefined
): string {
  if (!profile) return '/checkout?plan=6_months'
  const hadMembership =
    Boolean(profile.subscription_expires_at) ||
    profile.access_source === 'purchase' ||
    profile.access_source === 'enrollment_code'
  return hadMembership ? '/membership-required' : '/checkout?plan=6_months'
}

/** Fractional days remaining until subscription_expires_at (null = no expiry / unknown). */
export function subscriptionDaysRemaining(
  profile: Pick<EntitlementProfile, 'subscription_expires_at' | 'access_source'> | null | undefined,
  now = Date.now()
): number | null {
  if (!profile) return null
  if (profile.access_source === 'admin_trial') return null
  if (!profile.subscription_expires_at) return null
  const expires = new Date(profile.subscription_expires_at).getTime()
  if (!Number.isFinite(expires)) return null
  return (expires - now) / DAY_MS
}

/** True while past the end date but still inside the grace window. */
export function isInMembershipGrace(
  profile: EntitlementProfile | null | undefined,
  now = Date.now()
): boolean {
  if (!profile || profile.access_source === 'admin_trial') return false
  if (profile.payment_confirmed !== true) return false
  const days = subscriptionDaysRemaining(profile, now)
  return days != null && days <= 0 && days > -MEMBERSHIP_GRACE_DAYS
}

/** True when renew messaging should surface (≤7 days left, or in grace). */
export function needsMembershipRenewalAttention(
  profile: EntitlementProfile | null | undefined,
  now = Date.now()
): boolean {
  if (!profile || profile.access_source === 'admin_trial') return false
  if (profile.payment_confirmed !== true) return false
  const days = subscriptionDaysRemaining(profile, now)
  if (days == null) return false
  return days <= MEMBERSHIP_RENEWAL_WARNING_DAYS && days > -MEMBERSHIP_GRACE_DAYS
}

export type MembershipReminderStage = 'day_7' | 'day_1' | 'expired'

/** Pick the membership reminder stage from days until subscription_expires_at. */
export function membershipReminderStage(
  expiresAt: string | Date,
  now: number = Date.now()
): MembershipReminderStage | null {
  const expires = new Date(expiresAt).getTime()
  if (!Number.isFinite(expires)) return null
  const days = (expires - now) / DAY_MS
  if (days <= 0 && days > -MEMBERSHIP_GRACE_DAYS) return 'expired'
  if (days > 0 && days <= 1.5) return 'day_1'
  if (days > 1.5 && days <= MEMBERSHIP_RENEWAL_WARNING_DAYS + 0.5) return 'day_7'
  return null
}

/**
 * Block new/edited plan delivery only after the subscription has ended.
 * Clients with any time left (including the final day) can still get create/edit.
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

  // Allow while any time remains — including "1 day left". Block only when expired.
  if (days <= 0) {
    return {
      ok: false,
      error:
        'This client’s subscription has ended. Renew before creating or editing a plan.',
      daysRemaining: 0,
    }
  }

  return { ok: true }
}
