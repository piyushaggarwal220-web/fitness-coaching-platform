import { hasClientEntitlement } from '@/lib/entitlements'
import type { Coach, OnboardingProfile, Plan, Purchase } from '@/types/database'

const PLAN_DELIVERY_HOURS = 48

export type ClientDashboardStatus = {
  paymentConfirmed: boolean
  onboardingComplete: boolean
  coachAssigned: boolean
  coachName: string | null
  planStatus: string
  expectedDelivery: string | null
  nextAction: string | null
  nextActionHref: string | null
  showPlanCountdown: boolean
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

export function formatPlanCountdown(
  profile: Pick<OnboardingProfile, 'onboarding_complete' | 'onboarding_completed_at' | 'plan_delivered'>
): string | null {
  const deadline = getExpectedPlanDeliveryDate(profile)
  if (!deadline) return null

  const ms = deadline.getTime() - Date.now()
  if (ms <= 0) return 'Delivering soon'

  const totalMins = Math.floor(ms / 60000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  return `${hours}h ${mins}m remaining`
}

export function isPlanFullyReady(
  activePlan: Plan | null,
  profile: Pick<OnboardingProfile, 'plan_delivered'>
): boolean {
  if (!activePlan) return false
  const hasDiet = Boolean(activePlan.nutrition_plan?.trim())
  const hasWorkout = Boolean(activePlan.workout_plan?.trim())
  return hasDiet && hasWorkout && profile.plan_delivered === true
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
  const planReady = isPlanFullyReady(activePlan, profile)

  let planStatus = 'Not started'
  if (planReady) {
    planStatus = `Ready — ${activePlan!.title} (v${activePlan!.version})`
  } else if (activePlan) {
    planStatus = `Active — ${activePlan.title} (v${activePlan.version})`
  } else if (profile.plan_delivered) {
    planStatus = 'Delivered — awaiting activation'
  } else if (onboardingComplete) {
    planStatus = 'Coach is building your plan'
  } else if (paymentConfirmed) {
    planStatus = 'Complete onboarding to start plan delivery'
  }

  let nextAction: string | null = 'Choose a coaching plan'
  let nextActionHref: string | null = '/checkout?plan=6_months'
  let showPlanCountdown = false

  if (!paymentConfirmed) {
    nextAction = 'Complete payment to activate your account'
    nextActionHref = '/checkout?plan=6_months'
  } else if (!onboardingComplete) {
    nextAction = 'Complete your onboarding questionnaire'
    nextActionHref = '/onboarding'
  } else if (!coachAssigned) {
    nextAction = 'Your coach will be assigned within 48 hours'
    nextActionHref = null
  } else if (!planReady && !profile.plan_delivered) {
    nextAction = null
    nextActionHref = null
    showPlanCountdown = true
  } else if (planReady) {
    nextAction = 'Review your coaching plan'
    nextActionHref = '/plan'
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
    showPlanCountdown,
  }
}
