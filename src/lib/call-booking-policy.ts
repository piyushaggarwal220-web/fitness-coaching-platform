/**
 * Kept so older checks still import the cutoff. Call booking is by plan,
 * not by when the client joined.
 */
export const WEEKLY_CALL_NEW_CLIENTS_FROM_ISO = '2026-09-20T18:30:00.000Z'

/** One client-started call per rolling week. */
export const WEEKLY_CALL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const WEEKLY_CALL_PLAN_SLUGS = new Set(['6_months', '12_months'])

const OPEN_CALL_STATUSES = new Set(['requested', 'scheduled'])
const WEEK_COUNTING_STATUSES = new Set(['requested', 'scheduled', 'completed', 'declined'])

export type CallBookingPolicy = {
  canRequestManualCall: boolean
  /** 6-month and 12-month plans. Home shows the call button only for these. */
  weeklyCallPlan: boolean
  isTwelveMonth: boolean
  isGrandfatheredAthleticBody: boolean
  withinInitialTwoWeeks: boolean
  planDelivered: boolean
  /** User-facing explanation when booking is blocked. */
  message: string | null
  /** Whole days until weekly-call booking opens. Unused while booking opens at plan delivery. */
  daysUntilEligible: number | null
}

export type WeeklyCallBookingRow = {
  status: string
  requested_at: string
}

export function isWeeklyCallPlanSlug(planSlug: string | null | undefined): boolean {
  return WEEKLY_CALL_PLAN_SLUGS.has(planSlug ?? '')
}

export function isGrandfatheredAthleticBodyClient(_joinedAt: string | null | undefined): boolean {
  return false
}

/**
 * 6-month and 12-month clients can place one coach call from Home after the plan is delivered.
 * The once-per-week limit is applied from existing call rows, not here.
 */
export function evaluateCallBookingPolicy(input: {
  planSlug: string | null
  checkinScheduleStartedAt: string | null
  planDelivered?: boolean
  joinedAt?: string | null
  now?: Date
}): CallBookingPolicy {
  void input.checkinScheduleStartedAt
  void input.joinedAt
  void input.now
  const weeklyCallPlan = isWeeklyCallPlanSlug(input.planSlug)
  const planDelivered = input.planDelivered ?? false
  const canRequestManualCall = weeklyCallPlan && planDelivered
  return {
    canRequestManualCall,
    weeklyCallPlan,
    isTwelveMonth: input.planSlug === '12_months',
    isGrandfatheredAthleticBody: false,
    withinInitialTwoWeeks: false,
    planDelivered,
    message: weeklyCallPlan && !planDelivered
      ? 'You can place a call after your first plan is delivered.'
      : null,
    daysUntilEligible: null,
  }
}

/** True when a call row in this list already used the current 7-day booking window. */
export function weeklyCallAlreadyBooked(
  rows: WeeklyCallBookingRow[],
  now: Date
): { booked: boolean; open: boolean } {
  const cutoff = now.getTime() - WEEKLY_CALL_WINDOW_MS
  let booked = false
  let open = false
  for (const row of rows) {
    if (!WEEK_COUNTING_STATUSES.has(row.status)) continue
    const at = Date.parse(row.requested_at)
    if (!Number.isFinite(at) || at < cutoff) continue
    booked = true
    if (OPEN_CALL_STATUSES.has(row.status)) open = true
  }
  return { booked, open }
}

export function weeklyCallLimitMessage(open: boolean): string {
  return open
    ? 'You already booked a call this week. A coach will call you.'
    : 'You already placed a call this week. You can book the next one after 7 days.'
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
