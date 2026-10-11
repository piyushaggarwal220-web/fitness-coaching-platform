/**
 * Billing failures are not rate limits. A rate limit should retry.
 * "No credits remaining" will fail every retry until money is added, so callers
 * must stop instead of hammering the API.
 */

const BILLING_ERROR =
  /no credits remaining|insufficient_quota|exceeded your current quota|check your plan and billing|billing_hard_limit|billing hard limit/i

export function isOpenAiBillingError(message: string | null | undefined): boolean {
  if (!message) return false
  return BILLING_ERROR.test(message)
}

/** How long to wait before the next credit check after a billing failure. */
export const OPENAI_BILLING_HOLD_MS = 15 * 60 * 1000

/** One operator email per outage window, not one per waiting check-in. */
export const OPENAI_BILLING_ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000
