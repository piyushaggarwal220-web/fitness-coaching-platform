/**
 * Timing rules for automated check-in replies. Kept free of server-only imports so it can be
 * used from route handlers and exercised directly in scripts/tests.
 */

const HOUR_MS = 60 * 60 * 1000
const INDIA_TIME_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** Replies land 3–6 hours after the client submits (including overnight). */
export const AUTO_REPLY_MIN_DELAY_MS = 3 * HOUR_MS
export const AUTO_REPLY_MAX_DELAY_MS = 6 * HOUR_MS

/** Kept for callers that still label overnight hours; auto-send is allowed during this window. */
export const QUIET_HOURS_END_HOUR = 8

/** Hour-of-day (0–23) in coaching time. */
function getIstHour(date: Date): number {
  return new Date(date.getTime() + INDIA_TIME_OFFSET_MS).getUTCHours()
}

/** True while coaching-time is inside the overnight quiet window. */
export function isWithinQuietHours(date: Date): boolean {
  return getIstHour(date) < QUIET_HOURS_END_HOUR
}

/**
 * When the automated reply (and plan, if ready) should go out: a random 3–6 hours after
 * submission, including overnight. Never sooner than 3 hours after submit.
 */
export function computeAutoReplyAt(
  submittedAt: string | Date,
  random: () => number = Math.random
): Date {
  const submitted = submittedAt instanceof Date ? submittedAt : new Date(submittedAt)
  const base = Number.isNaN(submitted.getTime()) ? new Date() : submitted
  const spread = AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS
  const roll = Math.min(1, Math.max(0, random()))
  return new Date(base.getTime() + AUTO_REPLY_MIN_DELAY_MS + roll * spread)
}
