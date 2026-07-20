import type { Profile } from '@/types/database'

export type AccessSource = 'purchase' | 'admin_trial'

export type EntitlementProfile = Pick<Profile, 'payment_confirmed' | 'access_source' | 'subscription_expires_at'>

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
