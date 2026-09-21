import { getInitialWeeklyCallWindow } from '@/lib/weekly-call-timing'

/**
 * Clients who joined on/after this instant do not get weekly coach calls.
 * 2026-09-21 00:00 IST — existing Athletic Body (12-month) members stay grandfathered.
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

function daysUntil(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  if (ms <= 0) return 0
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export function isGrandfatheredAthleticBodyClient(joinedAt: string | null | undefined): boolean {
  if (!joinedAt) return false
  const joined = Date.parse(joinedAt)
  if (!Number.isFinite(joined)) return false
  return joined < Date.parse(WEEKLY_CALL_NEW_CLIENTS_FROM_ISO)
}

/**
 * Weekly coach calls are only for existing Athletic Body (12-month) clients.
 * They book from Home. New clients do not get calls. Nothing is auto-booked.
 */
export function evaluateCallBookingPolicy(input: {
  planSlug: string | null
  checkinScheduleStartedAt: string | null
  planDelivered?: boolean
  joinedAt?: string | null
  now?: Date
}): CallBookingPolicy {
  const now = input.now ?? new Date()
  const isTwelveMonth = input.planSlug === '12_months'
  const planDelivered = input.planDelivered ?? false
  const isGrandfatheredAthleticBody =
    isTwelveMonth && isGrandfatheredAthleticBodyClient(input.joinedAt)

  if (!isTwelveMonth || !isGrandfatheredAthleticBody) {
    return {
      canRequestManualCall: false,
      isTwelveMonth,
      isGrandfatheredAthleticBody: false,
      withinInitialTwoWeeks: false,
      planDelivered,
      message: null,
      daysUntilEligible: null,
    }
  }

  if (!planDelivered || !input.checkinScheduleStartedAt) {
    return {
      canRequestManualCall: false,
      isTwelveMonth: true,
      isGrandfatheredAthleticBody: true,
      withinInitialTwoWeeks: false,
      planDelivered,
      message: 'You can book a weekly coach call from Home after your first plan is delivered.',
      daysUntilEligible: null,
    }
  }

  const window = getInitialWeeklyCallWindow(input.checkinScheduleStartedAt, now)
  if (!window.eligible) {
    const daysUntilEligible = daysUntil(now, window.earliestAfter)
    return {
      canRequestManualCall: false,
      isTwelveMonth: true,
      isGrandfatheredAthleticBody: true,
      withinInitialTwoWeeks: true,
      planDelivered: true,
      message:
        daysUntilEligible > 0
          ? `Weekly calls open after your first week (${daysUntilEligible} day${daysUntilEligible === 1 ? '' : 's'} left).`
          : 'Your weekly call opens after your first week of coaching.',
      daysUntilEligible,
    }
  }

  return {
    canRequestManualCall: true,
    isTwelveMonth: true,
    isGrandfatheredAthleticBody: true,
    withinInitialTwoWeeks: false,
    planDelivered: true,
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
  if (!evaluateCallBookingPolicy(input).isGrandfatheredAthleticBody) return null
  if (!input.checkinScheduleStartedAt) return null
  const window = getInitialWeeklyCallWindow(input.checkinScheduleStartedAt, input.now)
  return window.eligible ? window.earliestAfter : null
}
