import { getInitialWeeklyCallWindow } from '@/lib/weekly-call-timing'

export type CallBookingPolicy = {
  canRequestManualCall: boolean
  isTwelveMonth: boolean
  withinInitialTwoWeeks: boolean
  planDelivered: boolean
  /** User-facing explanation when manual booking is blocked. */
  message: string | null
  /** Whole days until manual/auto call booking opens (during initial window). */
  daysUntilEligible: number | null
}

function daysUntil(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/**
 * Whether a client may use "Book a call" in chat.
 * 12-month members get auto weekly calls only — no manual booking.
 * Everyone else: no phone calls (chat + check-ins only).
 */
export function evaluateCallBookingPolicy(input: {
  planSlug: string | null
  checkinScheduleStartedAt: string | null
  planDelivered?: boolean
  now?: Date
}): CallBookingPolicy {
  const now = input.now ?? new Date()
  const isTwelveMonth = input.planSlug === '12_months'
  const planDelivered = input.planDelivered ?? false

  if (!isTwelveMonth) {
    return {
      canRequestManualCall: false,
      isTwelveMonth: false,
      withinInitialTwoWeeks: false,
      planDelivered,
      message: 'Weekly coach phone calls are included on the 12-month plan only. Use chat for questions.',
      daysUntilEligible: null,
    }
  }

  if (!planDelivered || !input.checkinScheduleStartedAt) {
    return {
      canRequestManualCall: false,
      isTwelveMonth: true,
      withinInitialTwoWeeks: false,
      planDelivered,
      message: 'Your weekly coach call will be booked automatically once your plan is delivered.',
      daysUntilEligible: null,
    }
  }

  const window = getInitialWeeklyCallWindow(input.checkinScheduleStartedAt, now)
  if (!window.eligible) {
    const daysUntilEligible = daysUntil(now, window.earliestAfter)
    return {
      canRequestManualCall: false,
      isTwelveMonth: true,
      withinInitialTwoWeeks: true,
      planDelivered: true,
      message: `Weekly calls start after your first 2 coaching weeks (${daysUntilEligible} day${daysUntilEligible === 1 ? '' : 's'} left). Use chat until then.`,
      daysUntilEligible,
    }
  }

  return {
    canRequestManualCall: false,
    isTwelveMonth: true,
    withinInitialTwoWeeks: false,
    planDelivered: true,
    message: 'Your weekly call is scheduled automatically — check below or your notifications.',
    daysUntilEligible: null,
  }
}

/** Earliest UTC instant a call may be scheduled for this client. */
export function earliestAllowedCallTime(input: {
  planSlug: string | null
  checkinScheduleStartedAt: string | null
  now?: Date
}): Date | null {
  if (input.planSlug !== '12_months' || !input.checkinScheduleStartedAt) return null
  const window = getInitialWeeklyCallWindow(input.checkinScheduleStartedAt, input.now)
  return window.eligible ? window.earliestAfter : null
}
