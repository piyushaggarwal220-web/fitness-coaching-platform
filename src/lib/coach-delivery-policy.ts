import type { OnboardingProfile } from '@/types/database'

/** Coaches whose clients never receive auto-generated or auto-published plans. */
const MANUAL_PLAN_DELIVERY_COACH_IDS = new Set([
  'fde68466-fb3e-4a24-a5f2-97a60a363690', // Piyush Aggarwal
])

export function coachRequiresManualPlanDelivery(coachId: string | null | undefined): boolean {
  return Boolean(coachId && MANUAL_PLAN_DELIVERY_COACH_IDS.has(coachId))
}

/** Manual-delivery coaches only receive clients via explicit admin assignment. */
export function coachAcceptsAutoAssignment(coachId: string | null | undefined): boolean {
  return Boolean(coachId) && !coachRequiresManualPlanDelivery(coachId)
}

export function clientRequiresManualPlanDelivery(
  profile: Pick<OnboardingProfile, 'coach_id'> | null | undefined
): boolean {
  return coachRequiresManualPlanDelivery(profile?.coach_id)
}

/** Initial plan jobs are only queued automatically for auto-delivery coaches. */
export function shouldAutoEnqueueInitialPlan(
  profile: Pick<OnboardingProfile, 'coach_id'> | null | undefined
): boolean {
  return !clientRequiresManualPlanDelivery(profile)
}
