/**
 * One decision for every client screen: is this plan live, still being written,
 * or already finished and missing. Screens must not invent their own sentence.
 */

export const STALE_PLAN_CHANGE_GENERATING_MS = 6 * 60 * 60 * 1000
export const STALE_PLAN_CHANGE_DRAFT_MS = 24 * 60 * 60 * 1000

const STILL_BEING_CREATED =
  /(?<!\bnot\b[\s\w]{0,24})(?:being created|being prepared|being built|being written|is building|check back shortly)/i

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
    headline: 'Smart Coach is building your plan',
    detail: input.instant
      ? `It arrives within ${input.windowLabel}. You’ll get an email, and it will show up in My Plan.`
      : 'It usually arrives within 24 hours and appears in My Plan automatically.',
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
