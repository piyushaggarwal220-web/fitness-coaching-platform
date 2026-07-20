import { getCoachingPlan } from '@/lib/payments/plans'
import type { Purchase } from '@/types/database'

export type ActiveSubscription = {
  planName: string
  planSlug: string
  status: 'active' | 'expired'
  startsAt: Date
  endsAt: Date
  startsLabel: string
  endsLabel: string
  daysRemaining: number | null
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Derive coaching subscription window from the latest captured purchase. */
export function getActiveSubscription(
  purchase: Pick<Purchase, 'plan_slug' | 'plan_name' | 'created_at' | 'status'> | null | undefined,
  subscriptionExpiresAt?: string | null,
  referenceDate: Date = new Date()
): ActiveSubscription | null {
  if (!purchase || purchase.status !== 'captured') return null

  const plan = getCoachingPlan(purchase.plan_slug)
  const startsAt = new Date(purchase.created_at)
  if (Number.isNaN(startsAt.getTime())) return null

  let endsAt: Date
  if (subscriptionExpiresAt) {
    endsAt = new Date(subscriptionExpiresAt)
  } else if (plan) {
    endsAt = new Date(startsAt)
    endsAt.setMonth(endsAt.getMonth() + plan.durationMonths)
  } else {
    return null
  }

  if (Number.isNaN(endsAt.getTime())) return null

  const msRemaining = endsAt.getTime() - referenceDate.getTime()
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))
  const status = msRemaining >= 0 ? 'active' : 'expired'

  return {
    planName: purchase.plan_name || plan?.name || purchase.plan_slug,
    planSlug: purchase.plan_slug,
    status,
    startsAt,
    endsAt,
    startsLabel: formatDateLabel(startsAt),
    endsLabel: formatDateLabel(endsAt),
    daysRemaining: status === 'active' ? daysRemaining : 0,
  }
}
