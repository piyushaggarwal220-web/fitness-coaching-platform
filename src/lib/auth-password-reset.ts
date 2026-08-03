/** Shared helpers for the forgot / reset password flow. */

export const PASSWORD_RECOVERY_COOKIE = 'lurvox_password_recovery'
/** How long the recovery marker is valid after the email link is opened. */
export const PASSWORD_RECOVERY_COOKIE_MAX_AGE_SEC = 60 * 30

export function isPasswordReauthError(message: string | null | undefined): boolean {
  if (!message) return false
  return /reauthentication|re-authentication|reauthenticate/i.test(message)
}

export function passwordReauthUserMessage(nonceAlreadySent = false): string {
  if (nonceAlreadySent) {
    return 'Enter the verification code from your email, then save again.'
  }
  return 'For security, enter the verification code we just emailed you, then save again.'
}
