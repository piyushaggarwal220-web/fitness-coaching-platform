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

export type HomePlanPhase =
  | 'delivered_for_checkin'
  | 'checkin_keeps_current'
  | 'waiting'
  | 'has_plan'
  | 'no_plan'

/**
 * What the home card should say about plan delivery.
 * A plan delivered at or after this check-in is ready — never keep the "still coming" line.
 */
export function getHomePlanPhase(input: {
  hasActivePlan: boolean
  expectsUpdate: boolean
  submittedAtMs: number | null
  deliveredAtMs: number | null
}): HomePlanPhase {
  const submitted = input.submittedAtMs
  const delivered = input.deliveredAtMs
  const hasCheckin = submitted != null && Number.isFinite(submitted)
  const deliveredForThisCheckin =
    hasCheckin && delivered != null && Number.isFinite(delivered) && delivered >= submitted

  if (deliveredForThisCheckin) return 'delivered_for_checkin'
  if (hasCheckin && !input.expectsUpdate && input.hasActivePlan) return 'checkin_keeps_current'
  if (hasCheckin && input.expectsUpdate) return 'waiting'
  if (input.hasActivePlan) return 'has_plan'
  return 'no_plan'
}

export type HomePlanCardCopy = {
  currentLine: string
  nextLine: string
}

/** Current plan plus how the next one arrives. Never says a delivered plan is still being created. */
export function getHomePlanCardCopy(input: {
  phase: HomePlanPhase
  planTitle: string | null
  deliveredAtLabel: string | null
  biweekly: boolean
  nextUpdateWeek: number | null
  weeklyDueNow: boolean
  checkedInAt: string | null
  readyBy: string | null
  overdue: boolean
}): HomePlanCardCopy {
  const title = input.planTitle?.trim() || 'Your coaching plan'
  const currentLine =
    input.phase === 'no_plan'
      ? 'You do not have a plan in My Plan yet.'
      : input.deliveredAtLabel
        ? `Current plan: ${title}. Delivered ${input.deliveredAtLabel}. It is in My Plan.`
        : `Current plan: ${title}. It is in My Plan.`

  if (input.phase === 'waiting') {
    const checkedIn = input.checkedInAt ? `You checked in at ${input.checkedInAt}. ` : ''
    const nextLine = input.overdue
      ? `${checkedIn}This update should be in My Plan now. It was due by ${input.readyBy ?? '30 minutes after your check-in'}.`
      : `${checkedIn}This update will be ready by ${input.readyBy ?? 'within 30 minutes'}, then it replaces the current plan in My Plan.`
    return { currentLine, nextLine }
  }

  if (input.phase === 'no_plan') {
    return {
      currentLine,
      nextLine:
        'Your first plan shows up in My Plan when it is ready. After that, submit the weekly check-in Sunday through Tuesday. The next plan is ready within 30 minutes.',
    }
  }

  if (input.biweekly && input.nextUpdateWeek) {
    return {
      currentLine,
      nextLine: `Next plan: submit the week ${input.nextUpdateWeek} weekly check-in, Sunday through Tuesday. It is ready within 30 minutes and replaces this plan in My Plan. Check-ins on other weeks keep the plan you have.`,
    }
  }

  if (input.weeklyDueNow && input.phase === 'has_plan') {
    return {
      currentLine,
      nextLine:
        'Next plan: submit this week’s check-in now. The window is Sunday through Tuesday. It is ready within 30 minutes and replaces this plan in My Plan.',
    }
  }

  return {
    currentLine,
    nextLine:
      'Next plan: submit the weekly check-in Sunday through Tuesday. It is ready within 30 minutes and replaces this plan in My Plan.',
  }
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
