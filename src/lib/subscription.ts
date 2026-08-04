import {
  isInMembershipGrace,
  MEMBERSHIP_RENEWAL_WARNING_DAYS,
  needsMembershipRenewalAttention,
  subscriptionDaysRemaining,
  type EntitlementProfile,
} from '@/lib/entitlements'
import { getCoachingPlan, getPurchasablePlan, isTrialPlanSlug } from '@/lib/payments/plans'
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

/** Checkout URL when the member taps their current plan (upgrade / renew / extend). */
export function checkoutHrefForSubscription(subscription: ActiveSubscription): string {
  const slug = subscription.planSlug

  if (subscription.status === 'expired') {
    if (isTrialPlanSlug(slug) || slug === '1_month') return '/checkout?plan=3_months'
    if (getPurchasablePlan(slug) && !getCoachingPlan(slug)?.isTrial) {
      return `/checkout?plan=${slug}`
    }
    return '/checkout?plan=3_months'
  }

  if (isTrialPlanSlug(slug) || slug === '1_month') return '/checkout?plan=3_months'
  if (slug === '3_months') return '/checkout?plan=6_months'
  if (slug === '6_months') return '/checkout?plan=12_months'
  return '/checkout?plan=12_months'
}

export function subscriptionPlanActionLabel(subscription: ActiveSubscription): string {
  if (subscription.status === 'expired') return 'Tap to renew'
  if (subscription.planSlug === '12_months') return 'Tap to extend'
  return 'Tap to upgrade'
}

export type MembershipRenewalPrompt = {
  tone: 'warning' | 'danger'
  title: string
  body: string
  ctaLabel: string
  href: string
  endsLabel: string
  daysRemaining: number
  inGrace: boolean
}

function formatEndsLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Dashboard / settings renew prompt when membership is ending or in grace. */
export function getMembershipRenewalPrompt(
  profile: EntitlementProfile | null | undefined,
  purchase?: Pick<Purchase, 'plan_slug' | 'plan_name' | 'created_at' | 'status'> | null,
  referenceDate: Date = new Date()
): MembershipRenewalPrompt | null {
  if (!needsMembershipRenewalAttention(profile, referenceDate.getTime())) return null
  if (!profile?.subscription_expires_at) return null

  const endsAt = new Date(profile.subscription_expires_at)
  if (Number.isNaN(endsAt.getTime())) return null

  const fractionalDays = subscriptionDaysRemaining(profile, referenceDate.getTime())
  if (fractionalDays == null) return null

  const inGrace = isInMembershipGrace(profile, referenceDate.getTime())
  const daysRemaining = Math.max(0, Math.ceil(fractionalDays))
  const endsLabel = formatEndsLabel(endsAt)
  const subscription = getActiveSubscription(purchase, profile.subscription_expires_at, referenceDate)
  const href = subscription
    ? checkoutHrefForSubscription({
        ...subscription,
        status: inGrace || subscription.status === 'expired' ? 'expired' : subscription.status,
      })
    : '/checkout?plan=3_months'

  if (inGrace) {
    return {
      tone: 'danger',
      title: 'Membership ended',
      body: `Your coaching access ended on ${endsLabel}. Renew now to keep your coach, plan, and tracker — you still have a short grace window.`,
      ctaLabel: 'Renew membership',
      href,
      endsLabel,
      daysRemaining: 0,
      inGrace: true,
    }
  }

  const dayCopy =
    daysRemaining === 0
      ? 'ends today'
      : daysRemaining === 1
        ? 'ends tomorrow'
        : `ends in ${daysRemaining} days`

  return {
    tone: daysRemaining <= 1 ? 'danger' : 'warning',
    title: 'Renew your membership',
    body: `Your ${subscription?.planName ?? 'coaching'} plan ${dayCopy} (${endsLabel}). Renew to keep uninterrupted coaching.`,
    ctaLabel: daysRemaining <= 1 ? 'Renew now' : 'Renew / upgrade',
    href,
    endsLabel,
    daysRemaining,
    inGrace: false,
  }
}

export function isSubscriptionRenewalUrgent(subscription: ActiveSubscription | null): boolean {
  if (!subscription) return false
  if (subscription.status === 'expired') return true
  return (
    subscription.daysRemaining != null &&
    subscription.daysRemaining <= MEMBERSHIP_RENEWAL_WARNING_DAYS
  )
}
