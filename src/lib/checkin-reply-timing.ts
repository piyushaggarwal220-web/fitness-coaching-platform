/**
 * Check-in reply delivery timing — keeps responses feeling human, not instant.
 *
 * Policy:
 * - Minimum wait after submit before coach feedback can reach the client: 3 hours
 * - Usual / expected window communicated to clients: 3–6 hours
 */

export const CHECKIN_REPLY_MIN_WAIT_MS = 3 * 60 * 60 * 1000
export const CHECKIN_REPLY_USUAL_MIN_HOURS = 3
export const CHECKIN_REPLY_USUAL_MAX_HOURS = 6
export const CHECKIN_REPLY_TARGET_WAIT_MS = CHECKIN_REPLY_USUAL_MIN_HOURS * 60 * 60 * 1000
export const CHECKIN_REPLY_OVERDUE_MS = CHECKIN_REPLY_USUAL_MAX_HOURS * 60 * 60 * 1000

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

/** Client-facing expectation after submitting a check-in. */
export function getClientCheckinReplyExpectationCopy(): string {
  return `Your coach typically replies in ${CHECKIN_REPLY_USUAL_MIN_HOURS}–${CHECKIN_REPLY_USUAL_MAX_HOURS} hours.`
}

/** Short status label for dashboard / schedule rows. */
export function getAwaitingReviewClientCopy(timing: CheckinReplyTiming | null): string {
  if (!timing) return getClientCheckinReplyExpectationCopy()
  if (!timing.canSend) {
    return `Coach is reviewing — usually ${CHECKIN_REPLY_USUAL_MIN_HOURS}–${CHECKIN_REPLY_USUAL_MAX_HOURS} hours`
  }
  if (timing.overdueUsualWindow) {
    return 'Coach reply coming soon'
  }
  return `Coach typically replies within ${CHECKIN_REPLY_USUAL_MAX_HOURS} hours`
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
  if (timing.canSend) {
    if (timing.overdueUsualWindow) {
      return `Minimum wait met. Usual window was ${CHECKIN_REPLY_USUAL_MIN_HOURS}–${CHECKIN_REPLY_USUAL_MAX_HOURS} hours — send when ready.`
    }
    if (timing.inUsualWindow) {
      return `In the usual ${CHECKIN_REPLY_USUAL_MIN_HOURS}–${CHECKIN_REPLY_USUAL_MAX_HOURS} hour reply window — good time to send.`
    }
    return `Minimum ${CHECKIN_REPLY_MIN_WAIT_MS / 3_600_000}h wait met. Prefer sending in the ${CHECKIN_REPLY_USUAL_MIN_HOURS}–${CHECKIN_REPLY_USUAL_MAX_HOURS} hour window when you can.`
  }
  return `Wait at least ${CHECKIN_REPLY_MIN_WAIT_MS / 3_600_000} hours before sending (${formatRemainingDuration(timing.remainingMinWaitMs)} left). Usual target is ${CHECKIN_REPLY_USUAL_MIN_HOURS}–${CHECKIN_REPLY_USUAL_MAX_HOURS} hours.`
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
