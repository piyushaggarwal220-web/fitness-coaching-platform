import type { AnyCoachingPlanSlug } from '@/lib/payments/plans'
import { getPurchasablePlan, isTrialPlanSlug } from '@/lib/payments/plans'

/** After purchase, members can move to a better (longer) plan within this window. */
export const PLAN_UPGRADE_WINDOW_HOURS = 48

/** Extra charge when upgrading after the free early-upgrade window. */
export const PLAN_LATE_UPGRADE_FEE_INR = 250

export const PLAN_UPGRADE_WINDOW_COPY =
  'Upgrade to a better plan within 48 hours of taking your plan. After 48 hours, upgrades cost ₹250 extra.'

export const PLAN_UPGRADE_WINDOW_SHORT =
  'Free upgrade within 48 hours. After that, ₹250 extra.'

export function planUpgradeWindowMs(hours: number = PLAN_UPGRADE_WINDOW_HOURS): number {
  return hours * 60 * 60 * 1000
}

export function hoursRemainingInPlanUpgradeWindow(
  startsAt: Date,
  referenceDate: Date = new Date(),
  hours: number = PLAN_UPGRADE_WINDOW_HOURS
): number | null {
  const elapsed = referenceDate.getTime() - startsAt.getTime()
  if (Number.isNaN(elapsed) || elapsed < 0) return hours
  const remainingMs = planUpgradeWindowMs(hours) - elapsed
  if (remainingMs <= 0) return null
  return Math.ceil(remainingMs / (60 * 60 * 1000))
}

export function isWithinPlanUpgradeWindow(
  startsAt: Date,
  referenceDate: Date = new Date(),
  hours: number = PLAN_UPGRADE_WINDOW_HOURS
): boolean {
  return hoursRemainingInPlanUpgradeWindow(startsAt, referenceDate, hours) != null
}

function canUpgradeFromSlug(planSlug: string): boolean {
  const slug = planSlug as AnyCoachingPlanSlug | string
  if (isTrialPlanSlug(slug)) return false
  if (slug === '12_months') return false
  if (!getPurchasablePlan(slug) && slug !== '1_month') return false
  return true
}

/** True when the member still has a higher plan to buy and is inside the 48h window. */
export function canOfferEarlyPlanUpgrade(
  subscription:
    | {
        status: 'active' | 'expired'
        planSlug: string
        startsAt: Date
      }
    | null
    | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!subscription || subscription.status !== 'active') return false
  if (!canUpgradeFromSlug(subscription.planSlug)) return false
  return isWithinPlanUpgradeWindow(subscription.startsAt, referenceDate)
}

/** Active member who can still upgrade, but the free 48h window has ended. */
export function isLatePlanUpgrade(
  subscription:
    | {
        status: 'active' | 'expired'
        planSlug: string
        startsAt: Date
      }
    | null
    | undefined,
  referenceDate: Date = new Date()
): boolean {
  if (!subscription || subscription.status !== 'active') return false
  if (!canUpgradeFromSlug(subscription.planSlug)) return false
  return !isWithinPlanUpgradeWindow(subscription.startsAt, referenceDate)
}

export const PLAN_LATE_UPGRADE_COPY = `After 48 hours, upgrading costs ₹${PLAN_LATE_UPGRADE_FEE_INR} extra.`
