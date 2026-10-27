/**
 * Who can book a coach call from Home.
 *
 * Athletic Body (12 months): weekly, only if they paid more than ₹3,000.
 * 6 months: one call every 14 days.
 * 3 months and cheap offers: no calls.
 */
export const WEEKLY_CALL_NEW_CLIENTS_FROM_ISO = '2026-09-20T18:30:00.000Z'

/** Strictly more than ₹3,000 captured (net of refunds). */
export const ATHLETIC_BODY_CALL_MIN_PAISE = 300_000

export type CallCadence = 'weekly' | 'biweekly' | 'none'

export type CallBookingPolicy = {
  canRequestManualCall: boolean
  showHomeButton: boolean
  isCallEligiblePlan: boolean
  isTwelveMonth: boolean
  /** @deprecated Use isCallEligiblePlan. True only for Athletic Body over ₹3,000. */
  isGrandfatheredAthleticBody: boolean
  callCadence: CallCadence
  intervalDays: number | null
  withinInitialTwoWeeks: boolean
  planDelivered: boolean
  message: string | null
  daysUntilEligible: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export function netPaidPaise(
  amountPaise: number | null | undefined,
  refundedPaise: number | null | undefined
): number {
  return Math.max(0, (amountPaise ?? 0) - (refundedPaise ?? 0))
}

export function callCadenceForPlan(
  planSlug: string | null | undefined,
  paidPaise: number | null | undefined
): CallCadence {
  if (planSlug === '12_months' && (paidPaise ?? 0) > ATHLETIC_BODY_CALL_MIN_PAISE) {
    return 'weekly'
  }
  if (planSlug === '6_months') return 'biweekly'
  return 'none'
}

export function intervalDaysForCadence(cadence: CallCadence): number | null {
  if (cadence === 'weekly') return 7
  if (cadence === 'biweekly') return 14
  return null
}

export function isGrandfatheredAthleticBodyClient(_joinedAt: string | null | undefined): boolean {
  return false
}

function daysUntil(from: Date, until: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - from.getTime()) / DAY_MS))
}

/**
 * Plan + first-week gate. Cooldown after a completed call is applied on the server.
 */
export function evaluateCallBookingPolicy(input: {
  planSlug: string | null
  paidAmountPaise?: number | null
  checkinScheduleStartedAt: string | null
  planDelivered?: boolean
  joinedAt?: string | null
  now?: Date
}): CallBookingPolicy {
  const now = input.now ?? new Date()
  const planDelivered = input.planDelivered ?? false
  const cadence = callCadenceForPlan(input.planSlug, input.paidAmountPaise ?? 0)
  const intervalDays = intervalDaysForCadence(cadence)
  const isTwelveMonth = input.planSlug === '12_months'
  const isCallEligiblePlan = cadence !== 'none'
  const base = {
    isTwelveMonth,
    isCallEligiblePlan,
    isGrandfatheredAthleticBody: cadence === 'weekly',
    callCadence: cadence,
    intervalDays,
    planDelivered,
  }

  if (!isCallEligiblePlan) {
    return {
      ...base,
      canRequestManualCall: false,
      showHomeButton: false,
      withinInitialTwoWeeks: false,
      message: null,
      daysUntilEligible: null,
    }
  }

  const cadenceLabel = cadence === 'weekly' ? 'weekly' : 'every 2 weeks'

  if (!planDelivered || !input.checkinScheduleStartedAt) {
    return {
      ...base,
      canRequestManualCall: false,
      showHomeButton: true,
      withinInitialTwoWeeks: false,
      message: `You can book a coach call (${cadenceLabel}) from Home after your first plan is delivered.`,
      daysUntilEligible: null,
    }
  }

  const started = new Date(input.checkinScheduleStartedAt)
  if (Number.isNaN(started.getTime())) {
    return {
      ...base,
      canRequestManualCall: false,
      showHomeButton: true,
      withinInitialTwoWeeks: true,
      message: 'Your coach call opens after your first week of coaching.',
      daysUntilEligible: 7,
    }
  }

  const opensAt = new Date(started.getTime() + 7 * DAY_MS)
  if (now.getTime() < opensAt.getTime()) {
    const daysUntilEligible = daysUntil(now, opensAt)
    return {
      ...base,
      canRequestManualCall: false,
      showHomeButton: true,
      withinInitialTwoWeeks: true,
      message:
        daysUntilEligible > 0
          ? `Coach calls open after your first week (${daysUntilEligible} day${daysUntilEligible === 1 ? '' : 's'} left).`
          : 'Your coach call opens after your first week of coaching.',
      daysUntilEligible,
    }
  }

  return {
    ...base,
    canRequestManualCall: true,
    showHomeButton: true,
    withinInitialTwoWeeks: false,
    message: null,
    daysUntilEligible: null,
  }
}

/** Earliest UTC instant a call may be scheduled for this client. */
export function earliestAllowedCallTime(input: {
  planSlug: string | null
  paidAmountPaise?: number | null
  checkinScheduleStartedAt: string | null
  joinedAt?: string | null
  now?: Date
}): Date | null {
  const policy = evaluateCallBookingPolicy({
    ...input,
    planDelivered: true,
  })
  if (!policy.isCallEligiblePlan || !input.checkinScheduleStartedAt) return null
  const started = new Date(input.checkinScheduleStartedAt)
  if (Number.isNaN(started.getTime())) return null
  return new Date(started.getTime() + 7 * DAY_MS)
}
