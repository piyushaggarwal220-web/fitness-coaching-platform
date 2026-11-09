import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Plan update cadence by coaching plan.
 * Check-ins stay mid week + weekly on every plan.
 * 3 month (and legacy 1 month): auto plan draft every 14 days (even coaching weeks).
 * 6 month and 12 month: auto plan draft every weekly check-in.
 * 84-day: a new plan every Sunday check-in only when the client asks for one.
 */

const BIWEEKLY_UPDATE_SLUGS = new Set(['3_months', '1_month'])

export function isBiweeklyPlanUpdate(planSlug: string | null | undefined): boolean {
  return Boolean(planSlug && BIWEEKLY_UPDATE_SLUGS.has(planSlug))
}

/** 84-day clients pick a new plan or the current plan on each Sunday check-in. */
export function offersSundayPlanChoice(planSlug: string | null | undefined): boolean {
  return planSlug === 'offer_84_days'
}

export function planUpdateCadenceLabel(planSlug: string | null | undefined): string {
  if (offersSundayPlanChoice(planSlug)) return 'Each week, if they ask'
  return isBiweeklyPlanUpdate(planSlug) ? 'Every 14 days' : 'Every week'
}

/**
 * Whether this weekly check-in should write a new plan.
 * A missing choice on an older 84-day check-in still updates, matching the weeks before the Sunday question existed.
 * An explicit false keeps the current plan.
 */
export function shouldGenerateChosenWeeklyPlan(input: {
  planSlug: string | null | undefined
  coachingWeek: number
  wantsPlanUpdate?: boolean | null
}): boolean {
  if (!shouldAutoGenerateWeeklyPlanDraft(input.planSlug, input.coachingWeek)) return false
  if (!offersSundayPlanChoice(input.planSlug)) return true
  return input.wantsPlanUpdate !== false
}

/** Week 2 / 4 / 6 … = coaching day 14, 28, 42. */
export function shouldAutoGenerateWeeklyPlanDraft(
  planSlug: string | null | undefined,
  coachingWeek: number
): boolean {
  if (!isBiweeklyPlanUpdate(planSlug)) return true
  return Number.isFinite(coachingWeek) && coachingWeek >= 2 && coachingWeek % 2 === 0
}

export function nextAutoPlanUpdateWeek(
  planSlug: string | null | undefined,
  coachingWeek: number
): number {
  if (shouldAutoGenerateWeeklyPlanDraft(planSlug, coachingWeek)) {
    return Math.max(1, Math.floor(coachingWeek) || 1)
  }
  const week = Math.max(1, Math.floor(coachingWeek) || 1)
  return week % 2 === 0 ? week + 2 : week + 1
}

export async function fetchCapturedPlanSlug(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('purchases')
    .select('plan_slug, status, created_at')
    .eq('user_id', userId)
    .in('status', ['captured', 'redeemed'])
    .not('plan_slug', 'in', '(exercise_library,exercise_videos_monthly)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.plan_slug as string | null) ?? null
}
