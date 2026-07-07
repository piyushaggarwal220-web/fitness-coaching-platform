import type { Profile } from '@/types/database'

export type AccessSource = 'purchase' | 'admin_trial'

export type EntitlementProfile = Pick<Profile, 'payment_confirmed' | 'access_source'>

/** Whether a client has active platform access (paid or admin-granted trial). */
export function hasClientEntitlement(profile: EntitlementProfile | null | undefined): boolean {
  if (!profile) return false
  if (profile.payment_confirmed === true) return true
  return profile.access_source === 'admin_trial'
}

export function isAdminTrialClient(profile: EntitlementProfile | null | undefined): boolean {
  return profile?.access_source === 'admin_trial'
}
