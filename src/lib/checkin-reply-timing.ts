/**
 * Check-in reply and updated-plan delivery timing.
 *
 * Policy:
 * - The plan and reply go out 26–28 minutes after the weekly check-in.
 * - Clients are told to check within 30 minutes.
 */

const MINUTE_MS = 60 * 1000

export const CHECKIN_REPLY_MIN_WAIT_MS = 26 * MINUTE_MS
export const CHECKIN_REPLY_USUAL_MIN_MINUTES = 26
export const CHECKIN_REPLY_USUAL_MAX_MINUTES = 28
/** What the home page and check-in confirmation tell the client. */
export const UPDATED_PLAN_READY_WITHIN_MS = 30 * MINUTE_MS
export const UPDATED_PLAN_READY_WITHIN_LABEL = '30 minutes'
export const CHECKIN_REPLY_TARGET_WAIT_MS = CHECKIN_REPLY_USUAL_MIN_MINUTES * MINUTE_MS
export const CHECKIN_REPLY_OVERDUE_MS = UPDATED_PLAN_READY_WITHIN_MS

export type CheckinReplyTiming = {
  submittedAtMs: number
  elapsedMs: number
  remainingMinWaitMs: number
  canSend: boolean
  inUsualWindow: boolean
  overdueUsualWindow: boolean
  readyAt: Date
  usualWindowEndsAt: Date
}

export function getCheckinReplyTiming(
  submittedAt: string | Date | null | undefined,
  now: Date = new Date()
): CheckinReplyTiming | null {
  if (!submittedAt) return null
  const submitted = submittedAt instanceof Date ? submittedAt : new Date(submittedAt)
  const submittedAtMs = submitted.getTime()
  if (!Number.isFinite(submittedAtMs)) return null

  const nowMs = now.getTime()
  const elapsedMs = Math.max(0, nowMs - submittedAtMs)
  const remainingMinWaitMs = Math.max(0, CHECKIN_REPLY_MIN_WAIT_MS - elapsedMs)
  const canSend = remainingMinWaitMs === 0
  const inUsualWindow =
    elapsedMs >= CHECKIN_REPLY_TARGET_WAIT_MS && elapsedMs < CHECKIN_REPLY_OVERDUE_MS
  const overdueUsualWindow = elapsedMs >= CHECKIN_REPLY_OVERDUE_MS

  return {
    submittedAtMs,
    elapsedMs,
    remainingMinWaitMs,
    canSend,
    inUsualWindow,
    overdueUsualWindow,
    readyAt: new Date(submittedAtMs + CHECKIN_REPLY_MIN_WAIT_MS),
    usualWindowEndsAt: new Date(submittedAtMs + CHECKIN_REPLY_OVERDUE_MS),
  }
}

/** Client-facing expectation after a weekly check-in that updates the plan. */
export function getClientCheckinReplyExpectationCopy(): string {
  return `Your updated plan will be ready in ${UPDATED_PLAN_READY_WITHIN_LABEL}. Check My Plan by then.`
}

/** Short status label for dashboard / schedule rows. */
export function getAwaitingReviewClientCopy(timing: CheckinReplyTiming | null): string {
  if (!timing) return getClientCheckinReplyExpectationCopy()
  if (!timing.canSend) {
    return `Your updated plan will be ready in ${UPDATED_PLAN_READY_WITHIN_LABEL}. Check My Plan by then.`
  }
  if (timing.overdueUsualWindow) {
    return 'Your updated plan should be in My Plan now.'
  }
  return `Your updated plan will be ready in ${UPDATED_PLAN_READY_WITHIN_LABEL}. Check My Plan by then.`
}

function formatRemainingDuration(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000)
  if (totalMinutes <= 1) return 'about 1 minute'
  if (totalMinutes < 60) return `${totalMinutes} minutes`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours}h ${minutes}m`
}

/** Coach-facing gate message when send is blocked. */
export function getCoachReplyWaitMessage(timing: CheckinReplyTiming): string {
  const windowLabel = `${CHECKIN_REPLY_USUAL_MIN_MINUTES}–${CHECKIN_REPLY_USUAL_MAX_MINUTES} minutes`
  if (timing.canSend) {
    if (timing.overdueUsualWindow) {
      return `Minimum wait met. Usual window was ${windowLabel} — send when ready.`
    }
    if (timing.inUsualWindow) {
      return `In the usual ${windowLabel} reply window — good time to send.`
    }
    return `Minimum ${CHECKIN_REPLY_USUAL_MIN_MINUTES} minute wait met. Prefer sending in the ${windowLabel} window when you can.`
  }
  return `Wait at least ${CHECKIN_REPLY_USUAL_MIN_MINUTES} minutes before sending (${formatRemainingDuration(timing.remainingMinWaitMs)} left). Usual target is ${windowLabel}. Clients are told ${UPDATED_PLAN_READY_WITHIN_LABEL}.`
}

export function assertCheckinReplyWaitElapsed(
  submittedAt: string | Date | null | undefined,
  now: Date = new Date()
): { ok: true; timing: CheckinReplyTiming } | { ok: false; error: string; timing: CheckinReplyTiming | null } {
  const timing = getCheckinReplyTiming(submittedAt, now)
  if (!timing) {
    return { ok: false, error: 'Check-in submission time is missing.', timing: null }
  }
  if (!timing.canSend) {
    return {
      ok: false,
      error: getCoachReplyWaitMessage(timing),
      timing,
    }
  }
  return { ok: true, timing }
}
