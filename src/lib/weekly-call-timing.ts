/** Shared timing helpers for 12-month weekly call scheduling (safe for client + scripts). */

const DAY_MS = 24 * 60 * 60 * 1000

/** No auto weekly calls during the first two coaching weeks after schedule start. */
export const INITIAL_WEEKLY_CALL_DELAY_MS = 14 * DAY_MS

/**
 * First auto weekly call opens only after 14 days from coaching schedule start.
 * Daily cron + ensure callers create the call once this window has elapsed.
 */
export function getInitialWeeklyCallWindow(
  scheduleStartedAt: string | Date,
  now = new Date()
): { earliestAfter: Date; eligible: boolean } {
  const started = new Date(scheduleStartedAt)
  if (Number.isNaN(started.getTime())) {
    return { earliestAfter: now, eligible: false }
  }
  const earliestAfter = new Date(started.getTime() + INITIAL_WEEKLY_CALL_DELAY_MS)
  return {
    earliestAfter,
    eligible: now.getTime() >= earliestAfter.getTime(),
  }
}
