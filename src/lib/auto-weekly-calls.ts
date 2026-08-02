import {
  WEEKLY_DAY,
  getCoachingDay,
  getCoachingDayInWeek,
  getCoachingWeek,
  getDueDate,
} from '@/lib/checkin-schedule'
import { planSlugIsTwelveMonth } from '@/lib/league/eligibility'
import { getActiveSubscription } from '@/lib/subscription'
import type { CallRequest, Purchase } from '@/types/database'

export type AutoWeeklyCallSlot = {
  coachingWeek: number
  dueDate: Date
}

export function autoWeeklyCallNote(coachingWeek: number): string {
  return `Auto-booked weekly call · Week ${coachingWeek} (Day 7)`
}

export function parseAutoWeeklyCallWeek(coachNote: string | null | undefined): number | null {
  if (!coachNote) return null
  const match = coachNote.match(/^Auto-booked weekly call · Week (\d+) \(Day 7\)$/)
  if (!match) return null
  const week = Number(match[1])
  return Number.isFinite(week) && week >= 1 ? week : null
}

export function getAutoWeeklyCallMeta(
  request: Pick<CallRequest, 'source' | 'coaching_week' | 'coach_note'>
): { isAutoWeekly: boolean; coachingWeek: number | null } {
  if (request.source === 'auto_weekly') {
    return {
      isAutoWeekly: true,
      coachingWeek: request.coaching_week ?? parseAutoWeeklyCallWeek(request.coach_note),
    }
  }
  const fromNote = parseAutoWeeklyCallWeek(request.coach_note)
  return {
    isAutoWeekly: fromNote != null,
    coachingWeek: fromNote,
  }
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
