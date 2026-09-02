/** Trial / testing clients must never appear on a coach roster or work queue. */
export const TRIAL_CLIENT_EMAIL_SUFFIX = '@trial.test.local'
/** Named demo client used by local Testing Tools — coaches may still see it if assigned. */
export const DEMO_CLIENT_VISIBLE_TO_COACHES_EMAIL = 'client@test.local'

export function isTrialClientEmail(email: string | null | undefined): boolean {
  return String(email ?? '')
    .trim()
    .toLowerCase()
    .endsWith(TRIAL_CLIENT_EMAIL_SUFFIX)
}

export function isTrialClientHiddenFromCoaches(profile: {
  email?: string | null
  access_source?: string | null
}): boolean {
  const email = String(profile.email ?? '').trim().toLowerCase()
  if (email === DEMO_CLIENT_VISIBLE_TO_COACHES_EMAIL) return false
  if (isTrialClientEmail(email)) return true
  return profile.access_source === 'admin_trial'
}
