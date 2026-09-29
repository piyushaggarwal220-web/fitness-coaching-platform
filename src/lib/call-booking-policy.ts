/**
 * Kept so older checks still import the cutoff. No client is grandfathered:
 * nobody gets a coach call, including Athletic Body buyers from before this date.
 */
export const WEEKLY_CALL_NEW_CLIENTS_FROM_ISO = '2026-09-20T18:30:00.000Z'

export type CallBookingPolicy = {
  canRequestManualCall: boolean
  isTwelveMonth: boolean
  isGrandfatheredAthleticBody: boolean
  withinInitialTwoWeeks: boolean
  planDelivered: boolean
  /** User-facing explanation when booking is blocked for a grandfathered client. */
  message: string | null
  /** Whole days until weekly-call booking opens (during initial window). */
  daysUntilEligible: number | null
}

export function isGrandfatheredAthleticBodyClient(_joinedAt: string | null | undefined): boolean {
  return false
}

/**
 * No client can book a coach call. Home hides the booking card.
 * Nothing is auto-booked.
 */
export function evaluateCallBookingPolicy(input: {
  planSlug: string | null
  checkinScheduleStartedAt: string | null
  planDelivered?: boolean
  joinedAt?: string | null
  now?: Date
}): CallBookingPolicy {
  return {
    canRequestManualCall: false,
    isTwelveMonth: input.planSlug === '12_months',
    isGrandfatheredAthleticBody: false,
    withinInitialTwoWeeks: false,
    planDelivered: input.planDelivered ?? false,
    message: null,
    daysUntilEligible: null,
  }
}

/** Earliest UTC instant a call may be scheduled for this client. */
export function earliestAllowedCallTime(input: {
  planSlug: string | null
  checkinScheduleStartedAt: string | null
  joinedAt?: string | null
  now?: Date
}): Date | null {
  void input
  return null
}
