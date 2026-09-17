import { getClientPaymentGatePath, hasClientEntitlement } from '@/lib/entitlements'
import { clientFacingPlanTitle } from '@/lib/plan-metadata'
import { isDigitalPlanSlug } from '@/lib/payments/plans'
import type { Coach, OnboardingProfile, Plan, Purchase } from '@/types/database'

/** Coaching plan delivery SLA after onboarding completes (hours). */
export const PLAN_DELIVERY_HOURS = 24

/** Customised digital plan SLA — auto-deliver within 3 hours of intake. */
export const DIGITAL_PLAN_DELIVERY_HOURS = 3

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
  /** Plan is ready but client has not opened diet + workout yet */
  showOpenPlanPrompt: boolean
  /** Client opened diet + workout — put tracker at the top, hide plan CTA */
  preferTrackerUpTop: boolean
}

export function hasOpenedDietAndWorkout(
  plan: Pick<Plan, 'diet_opened_at' | 'workout_opened_at'> | null | undefined
): boolean {
  return Boolean(plan?.diet_opened_at && plan?.workout_opened_at)
}

export function getExpectedPlanDeliveryDate(
  profile: Pick<OnboardingProfile, 'onboarding_complete' | 'onboarding_completed_at' | 'plan_delivered'>,
  options?: { digital?: boolean }
): Date | null {
  if (!profile.onboarding_complete || profile.plan_delivered) return null
  if (!profile.onboarding_completed_at) return null

  const hours = options?.digital ? DIGITAL_PLAN_DELIVERY_HOURS : PLAN_DELIVERY_HOURS
  const completedAt = new Date(profile.onboarding_completed_at)
  return new Date(completedAt.getTime() + hours * 60 * 60 * 1000)
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
  profile: Pick<OnboardingProfile, 'onboarding_complete' | 'onboarding_completed_at' | 'plan_delivered'>,
  options?: { digital?: boolean }
): string | null {
  const deadline = getExpectedPlanDeliveryDate(profile, options)
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
  profile: Pick<OnboardingProfile, 'plan_delivered'>,
  options?: { sections?: 'workout' | 'diet' | 'both' | null }
): boolean {
  if (!activePlan) return false
  const hasDiet = Boolean(activePlan.nutrition_plan?.trim())
  const hasWorkout = Boolean(activePlan.workout_plan?.trim())
  const sections = options?.sections
  if (sections === 'workout') return hasWorkout || profile.plan_delivered === true
  if (sections === 'diet') return hasDiet || profile.plan_delivered === true
  // Content is authoritative: once diet + workout exist on the active plan, stop showing "preparing".
  if (hasDiet && hasWorkout) return true
  // Fallback for edge cases where delivery flag flipped but sections are still hydrating.
  return profile.plan_delivered === true && (hasDiet || hasWorkout)
}

export function getClientDashboardStatus(params: {
  profile: OnboardingProfile
  purchase: Purchase | null
  coach: Pick<Coach, 'name'> | null
  activePlan: Plan | null
}): ClientDashboardStatus {
  const { profile, purchase, coach, activePlan } = params
  const isDigital = isDigitalPlanSlug(purchase?.plan_slug)
  const digitalSections = isDigital
    ? purchase?.plan_slug === 'digital_workout'
      ? 'workout'
      : purchase?.plan_slug === 'digital_diet'
        ? 'diet'
        : 'both'
    : null
  const paymentConfirmed = hasClientEntitlement(profile) || Boolean(purchase)
  const onboardingComplete = profile.onboarding_complete === true
  const coachAssigned = Boolean(profile.coach_id)
  const expectedDeliveryDate = getExpectedPlanDeliveryDate(profile, { digital: isDigital })
  const planReady = isPlanFullyReady(activePlan, profile, { sections: digitalSections })
  const openedCore = isDigital
    ? digitalSections === 'workout'
      ? Boolean(activePlan?.workout_opened_at)
      : digitalSections === 'diet'
        ? Boolean(activePlan?.diet_opened_at)
        : hasOpenedDietAndWorkout(activePlan)
    : hasOpenedDietAndWorkout(activePlan)
  const preferTrackerUpTop = planReady && openedCore
  const showOpenPlanPrompt = planReady && !openedCore

  let planStatus = 'Not started'
  if (preferTrackerUpTop) {
    planStatus = `Active — ${clientFacingPlanTitle(activePlan!.title)} (v${activePlan!.version})`
  } else if (planReady) {
    planStatus = `Ready — ${clientFacingPlanTitle(activePlan!.title)} (v${activePlan!.version})`
  } else if (activePlan) {
    planStatus = `Active — ${clientFacingPlanTitle(activePlan.title)} (v${activePlan.version})`
  } else if (profile.plan_delivered) {
    planStatus = 'Delivered — awaiting activation'
  } else if (onboardingComplete) {
    planStatus = isDigital
      ? 'Building your customised plan'
      : 'Your AI coach is building your plan'
  } else if (paymentConfirmed) {
    planStatus = 'Complete onboarding to start plan delivery'
  }

  let nextAction: string | null = 'Choose a coaching plan'
  let nextActionHref: string | null = getClientPaymentGatePath(profile)
  let showPlanCountdown = false

  if (!paymentConfirmed) {
    nextAction = 'Complete payment to activate your account'
    nextActionHref = getClientPaymentGatePath(profile)
  } else if (!onboardingComplete) {
    const needsPhotos =
      profile.gender !== 'female' &&
      (!profile.progress_photo_front || !profile.progress_photo_side || !profile.progress_photo_back)
    nextAction = needsPhotos
      ? isDigital
        ? 'Upload front, side, and back photos to finish onboarding — your customised plan starts after that.'
        : 'Upload front, side, and back photos to finish onboarding — your personalized diet and workout plan will start being prepared after that.'
      : isDigital
        ? 'Finish onboarding so we can build your customised plan (usually within a few hours). Tracker, Journey, and AI chat unlock separately if you want them.'
        : 'Finish onboarding (review & submit) so your AI coach can prepare your personalized diet and workout plan.'
    nextActionHref = '/onboarding'
  } else if (!coachAssigned && !isDigital) {
    nextAction = 'Setting up your AI coach — usually within a few minutes'
    nextActionHref = null
  } else if (!planReady && !profile.plan_delivered) {
    // Coach + countdown card handles this — avoid duplicate next-step CTA
    nextAction = null
    nextActionHref = null
    showPlanCountdown = true
  } else if (showOpenPlanPrompt) {
    // PlanCountdownCard prompts to open diet + workout — avoid duplicate next-step.
    nextAction = null
    nextActionHref = null
  } else if (preferTrackerUpTop) {
    nextAction = null
    nextActionHref = null
  } else if (activePlan) {
    nextAction = isDigital ? 'Open your customised plan' : 'Open your coaching plan'
    nextActionHref = '/plan'
  } else {
    nextAction = 'Submit your first weekly check-in'
    nextActionHref = '/checkin'
  }

  return {
    paymentConfirmed,
    onboardingComplete,
    coachAssigned,
    coachName: coach?.name?.trim() || (profile.coach_id ? 'Your coach' : null),
    planStatus,
    expectedDelivery: formatExpectedDelivery(expectedDeliveryDate),
    nextAction,
    nextActionHref,
    showPlanCountdown,
    showOpenPlanPrompt,
    preferTrackerUpTop,
  }
}
