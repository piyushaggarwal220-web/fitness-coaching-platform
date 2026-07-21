import {
  CHECKIN_SUBMISSION_WINDOW_MS,
  getDueDate,
  MID_WEEK_DAY,
  WEEKLY_DAY,
} from '@/lib/checkin-schedule'
import type { CheckinType } from '@/types/database'

export const REFUND_CHECKIN_THRESHOLD_PERCENT = 90

export type RefundCheckinSubmission = {
  id: string
  checkinType: CheckinType
  coachingWeek: number | null
  submittedAt: string
  dueAt: string | null
}

export type RefundCheckinEligibility = {
  status: 'eligible' | 'ineligible' | 'pending'
  dueCount: number
  onTimeCount: number
  lateCount: number
  missingCount: number
  openWindowCount: number
  percentage: number
  thresholdPercent: number
  evaluatedAt: string
  reason: string
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Computes guarantee eligibility from the anchored schedule and persisted timestamps.
 * The 48-hour window is [due_at, due_at + 48h); exactly +48h is late.
 */
export function computeRefundCheckinEligibility(input: {
  scheduleStartedAt: string | null
  submissions: RefundCheckinSubmission[]
  evaluatedAt?: Date
}): RefundCheckinEligibility {
  const now = input.evaluatedAt ?? new Date()
  const evaluatedAt = now.toISOString()
  if (!input.scheduleStartedAt || !validDate(input.scheduleStartedAt)) {
    return {
      status: 'ineligible',
      dueCount: 0,
      onTimeCount: 0,
      lateCount: 0,
      missingCount: 0,
      openWindowCount: 0,
      percentage: 0,
      thresholdPercent: REFUND_CHECKIN_THRESHOLD_PERCENT,
      evaluatedAt,
      reason: 'No check-in schedule has started, so no due check-ins can be assessed.',
    }
  }

  let dueCount = 0
  let onTimeCount = 0
  let lateCount = 0
  let missingCount = 0
  let openWindowCount = 0

  for (let week = 1; week <= 520; week += 1) {
    const slots: { type: CheckinType; day: number }[] = [
      { type: 'mid_week', day: MID_WEEK_DAY },
      { type: 'weekly', day: WEEKLY_DAY },
    ]
    let futureSlots = 0

    for (const slot of slots) {
      const scheduledDue = getDueDate(input.scheduleStartedAt, week, slot.day)
      const submission = input.submissions.find(
        (row) => row.coachingWeek === week && row.checkinType === slot.type
      )
      const authoritativeDue = validDate(submission?.dueAt) ?? scheduledDue
      if (authoritativeDue.getTime() > now.getTime()) {
        futureSlots += 1
        continue
      }

      dueCount += 1
      const submittedAt = validDate(submission?.submittedAt)
      const deadline = authoritativeDue.getTime() + CHECKIN_SUBMISSION_WINDOW_MS
      if (
        submittedAt &&
        submittedAt.getTime() >= authoritativeDue.getTime() &&
        submittedAt.getTime() < deadline
      ) {
        onTimeCount += 1
      } else if (submittedAt) {
        lateCount += 1
      } else {
        missingCount += 1
        if (now.getTime() < deadline) openWindowCount += 1
      }
    }

    if (futureSlots === slots.length) break
  }

  const percentage = dueCount === 0 ? 0 : Math.round((onTimeCount / dueCount) * 10_000) / 100
  if (dueCount === 0) {
    return {
      status: 'ineligible',
      dueCount,
      onTimeCount,
      lateCount,
      missingCount,
      openWindowCount,
      percentage,
      thresholdPercent: REFUND_CHECKIN_THRESHOLD_PERCENT,
      evaluatedAt,
      reason: 'No check-ins are due yet; the coaching results guarantee cannot be assessed.',
    }
  }
  if (openWindowCount > 0) {
    return {
      status: 'pending',
      dueCount,
      onTimeCount,
      lateCount,
      missingCount,
      openWindowCount,
      percentage,
      thresholdPercent: REFUND_CHECKIN_THRESHOLD_PERCENT,
      evaluatedAt,
      reason: 'At least one due check-in still has an open 48-hour submission window.',
    }
  }

  const meetsThreshold = onTimeCount * 100 >= dueCount * REFUND_CHECKIN_THRESHOLD_PERCENT
  return {
    status: meetsThreshold ? 'eligible' : 'ineligible',
    dueCount,
    onTimeCount,
    lateCount,
    missingCount,
    openWindowCount,
    percentage,
    thresholdPercent: REFUND_CHECKIN_THRESHOLD_PERCENT,
    evaluatedAt,
    reason: meetsThreshold
      ? 'The client submitted at least 90% of all due check-ins within each 48-hour window.'
      : 'The client submitted fewer than 90% of all due check-ins within each 48-hour window.',
  }
}
