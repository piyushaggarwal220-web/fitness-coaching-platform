/**
 * One decision for every client screen: is this plan live, still being written,
 * or already finished and missing. Screens must not invent their own sentence.
 */

export const STALE_PLAN_CHANGE_GENERATING_MS = 6 * 60 * 60 * 1000
export const STALE_PLAN_CHANGE_DRAFT_MS = 24 * 60 * 60 * 1000

const STILL_BEING_CREATED =
  /(?<!\bnot\b[\s\w]{0,24})(?:being created|being prepared|being built|being written|is building|check back shortly)/i

/** Internal planning language. Members must never see it. */
const INTERNAL_PLAN_LANGUAGE = /generat/i

/**
 * Member-facing substitute for an error that leaked internal planning language.
 * Specific intake errors (measurements, photos, terms) pass through.
 */
export function clientSafePlanError(message: string | null | undefined, fallback: string): string {
  const trimmed = (message ?? '').trim()
  if (!trimmed || INTERNAL_PLAN_LANGUAGE.test(trimmed)) return fallback
  return trimmed
}

/** Sentence shown when intake is saved but the first plan cannot start. */
export function intakePlanStartError(serverError: string): string {
  const fallback = 'Intake saved, but your plan could not be started yet. Please try again or message support.'
  const trimmed = serverError.trim()
  if (!trimmed || INTERNAL_PLAN_LANGUAGE.test(trimmed)) return fallback
  return `Intake saved, but your plan could not be started yet: ${trimmed}`
}

export function copySaysPlanIsBeingCreated(text: string): boolean {
  return STILL_BEING_CREATED.test(text)
}

export type AbsentPlanCopy = {
  headline: string
  detail: string
  /** True only while a first plan is actually still being written. */
  inProgress: boolean
}

/**
 * Copy for a client who has no live plan row.
 * A delivered flag, a finished job, or a failed job is not "still being created".
 */
export function absentPlanCopy(input: {
  jobStatus?: string | null
  planDelivered?: boolean
  instant?: boolean
  windowLabel: string
}): AbsentPlanCopy {
  if (input.planDelivered) {
    return {
      headline: 'Your plan was delivered',
      detail: input.instant
        ? 'If sections look empty, refresh or check your email link.'
        : 'If sections look empty, refresh or message your coach.',
      inProgress: false,
    }
  }
  if (input.jobStatus === 'failed') {
    return {
      headline: 'Your plan did not finish',
      detail: 'It is not still being created. Message your coach if My Plan stays empty.',
      inProgress: false,
    }
  }
  if (input.jobStatus === 'ready') {
    return {
      headline: 'Your plan is not live in My Plan',
      detail:
        'A draft was prepared, but it was never published. Refresh My Plan. If it is still empty, message your coach.',
      inProgress: false,
    }
  }
  return {
    headline: 'Your plan is not in My Plan yet',
    detail: input.instant
      ? `It shows up in My Plan within ${input.windowLabel}. You’ll get an email when it is there.`
      : 'It shows up in My Plan within 24 hours.',
    inProgress: true,
  }
}

/** What Today and the status card may say about the sections that actually exist. */
export function livePlanSectionDetail(input: {
  hasDiet: boolean
  hasWorkout: boolean
  planDelivered?: boolean
}): string {
  if (input.hasDiet && input.hasWorkout) return 'Diet and workout are in My Plan.'
  if (input.hasDiet) return 'Your diet is in My Plan. The workout section is empty.'
  if (input.hasWorkout) return 'Your workout is in My Plan. The diet section is empty.'
  if (input.planDelivered) {
    return 'Your plan was marked delivered. Open My Plan if the sections look empty.'
  }
  return 'Open My Plan.'
}

/** An edit that never replaced the live plan must not keep saying it is being written. */
export function isStalePlanChangeRequest(
  status: string,
  lockedAtMs: number,
  nowMs = Date.now()
): boolean {
  if (!Number.isFinite(lockedAtMs)) return false
  const age = nowMs - lockedAtMs
  if (status === 'generating') return age > STALE_PLAN_CHANGE_GENERATING_MS
  if (status === 'draft_ready' || status === 'in_review') return age > STALE_PLAN_CHANGE_DRAFT_MS
  return false
}
