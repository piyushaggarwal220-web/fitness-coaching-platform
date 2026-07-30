import {
  WEEKLY_DAY,
  getCoachingDay,
  getCoachingDayInWeek,
  getCoachingWeek,
  getDueDate,
} from '@/lib/checkin-schedule'
import { planSlugIsTwelveMonth } from '@/lib/league/eligibility'
import { getActiveSubscription } from '@/lib/subscription'
import type { Purchase } from '@/types/database'

export type AutoWeeklyCallSlot = {
  coachingWeek: number
  dueDate: Date
}

/**
 * One-year plans auto-book a coach call on coaching Day 7 of each week
 * (same cadence as the weekly check-in day).
 */
export function getAutoWeeklyCallSlot(
  scheduleStartedAt: string | Date,
  referenceDate: Date = new Date()
): AutoWeeklyCallSlot | null {
  const coachingDay = getCoachingDay(scheduleStartedAt, referenceDate)
  const dayInWeek = getCoachingDayInWeek(coachingDay)
  if (dayInWeek !== WEEKLY_DAY) return null

  const coachingWeek = getCoachingWeek(coachingDay)
  return {
    coachingWeek,
    dueDate: getDueDate(scheduleStartedAt, coachingWeek, WEEKLY_DAY),
  }
}

export function isTwelveMonthActiveSubscription(
  purchase: Pick<Purchase, 'plan_slug' | 'plan_name' | 'created_at' | 'status'> | null | undefined,
  subscriptionExpiresAt?: string | null,
  referenceDate: Date = new Date()
): boolean {
  const subscription = getActiveSubscription(purchase, subscriptionExpiresAt, referenceDate)
  return Boolean(
    subscription?.status === 'active' && planSlugIsTwelveMonth(subscription.planSlug)
  )
}
