import { hasClientEntitlement } from '@/lib/entitlements'
import type { Coach, OnboardingProfile, Plan, Purchase } from '@/types/database'

const PLAN_DELIVERY_HOURS = 24

export type ClientDashboardStatus = {
  paymentConfirmed: boolean
  onboardingComplete: boolean
  coachAssigned: boolean
  coachName: string | null
  planStatus: string
  expectedDelivery: string | null
  nextAction: string
  nextActionHref: string
}

export function getExpectedPlanDeliveryDate(
  profile: Pick<OnboardingProfile, 'onboarding_complete' | 'onboarding_completed_at' | 'plan_delivered'>
): Date | null {
  if (!profile.onboarding_complete || profile.plan_delivered) return null
  if (!profile.onboarding_completed_at) return null

  const completedAt = new Date(profile.onboarding_completed_at)
  return new Date(completedAt.getTime() + PLAN_DELIVERY_HOURS * 60 * 60 * 1000)
}

export function formatExpectedDelivery(date: Date | null): string | null {
  if (!date) return null
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getClientDashboardStatus(params: {
  profile: OnboardingProfile
  purchase: Purchase | null
  coach: Pick<Coach, 'name'> | null
  activePlan: Plan | null
}): ClientDashboardStatus {
  const { profile, purchase, coach, activePlan } = params
  const paymentConfirmed = hasClientEntitlement(profile) || Boolean(purchase)
  const onboardingComplete = profile.onboarding_complete === true
  const coachAssigned = Boolean(profile.coach_id)
  const expectedDeliveryDate = getExpectedPlanDeliveryDate(profile)

  let planStatus = 'Not started'
  if (activePlan) {
    planStatus = `Active — ${activePlan.title} (v${activePlan.version})`
  } else if (profile.plan_delivered) {
    planStatus = 'Delivered — awaiting activation'
  } else if (onboardingComplete) {
    planStatus = 'Coach is building your plan'
  } else if (paymentConfirmed) {
    planStatus = 'Complete onboarding to start plan delivery'
  }

  let nextAction = 'Choose a coaching plan'
  let nextActionHref = '/checkout?plan=6_months'

  if (!paymentConfirmed) {
    nextAction = 'Complete payment to activate your account'
    nextActionHref = '/checkout?plan=6_months'
  } else if (!onboardingComplete) {
    nextAction = 'Complete your onboarding questionnaire'
    nextActionHref = '/onboarding'
  } else if (!coachAssigned) {
    nextAction = 'Your coach will be assigned within 24 hours'
    nextActionHref = '/dashboard'
  } else if (!activePlan && !profile.plan_delivered) {
    nextAction = 'Your personalised plan is being prepared'
    nextActionHref = '/dashboard'
  } else if (activePlan) {
    nextAction = 'Review your coaching plan'
    nextActionHref = '/plan'
  } else {
    nextAction = 'Submit your first weekly check-in'
    nextActionHref = '/checkin'
  }

  return {
    paymentConfirmed,
    onboardingComplete,
    coachAssigned,
    coachName: coach?.name ?? (profile.coach_id ? 'Assigned' : null),
    planStatus,
    expectedDelivery: formatExpectedDelivery(expectedDeliveryDate),
    nextAction,
    nextActionHref,
  }
}
