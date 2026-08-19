/**
 * Timing rules for automated check-in replies. Kept free of server-only imports so it can be
 * used from route handlers and exercised directly in scripts/tests.
 */

const HOUR_MS = 60 * 60 * 1000
const INDIA_TIME_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** Replies land 5–8 hours after the client submits, so it never feels instant or robotic. */
export const AUTO_REPLY_MIN_DELAY_MS = 5 * HOUR_MS
export const AUTO_REPLY_MAX_DELAY_MS = 8 * HOUR_MS

/** Quiet hours in coaching time: nothing is sent between midnight and 08:00 IST. */
export const QUIET_HOURS_END_HOUR = 8
/** Spread of post-quiet-hours sends so a night's backlog does not all fire at 08:00 sharp. */
const MORNING_SPREAD_MS = 2 * HOUR_MS

/** Hour-of-day (0–23) in coaching time. */
function getIstHour(date: Date): number {
  return new Date(date.getTime() + INDIA_TIME_OFFSET_MS).getUTCHours()
}

/** Midnight IST of the coaching day containing `date`, as a UTC instant. */
function getIstDayStart(date: Date): Date {
  const istTime = new Date(date.getTime() + INDIA_TIME_OFFSET_MS)
  const utcMidnight = Date.UTC(istTime.getUTCFullYear(), istTime.getUTCMonth(), istTime.getUTCDate())
  return new Date(utcMidnight - INDIA_TIME_OFFSET_MS)
}

/** True while coaching-time is inside the overnight quiet window. */
export function isWithinQuietHours(date: Date): boolean {
  return getIstHour(date) < QUIET_HOURS_END_HOUR
}

/**
 * When the automated reply for a check-in should go out: a random 5–8 hours after submission,
 * pushed into the morning (08:00–10:00 IST) if that lands during quiet hours so clients are
 * never messaged in the middle of the night.
 */
export function computeAutoReplyAt(
  submittedAt: string | Date,
  random: () => number = Math.random
): Date {
  const submitted = submittedAt instanceof Date ? submittedAt : new Date(submittedAt)
  const base = Number.isNaN(submitted.getTime()) ? new Date() : submitted
  const spread = AUTO_REPLY_MAX_DELAY_MS - AUTO_REPLY_MIN_DELAY_MS
  const target = new Date(base.getTime() + AUTO_REPLY_MIN_DELAY_MS + random() * spread)

  if (!isWithinQuietHours(target)) return target

  const morning = getIstDayStart(target).getTime() + QUIET_HOURS_END_HOUR * HOUR_MS
  return new Date(morning + random() * MORNING_SPREAD_MS)
}
