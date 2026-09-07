import type { OnboardingProfile } from '@/types/database'

const PIYUSH_COACH_ID = 'fde68466-fb3e-4a24-a5f2-97a60a363690'
const RAKSHIT_COACH_ID = 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a'

/** Coaches whose clients never receive auto-generated, auto-replied, or auto-published plans. */
const MANUAL_PLAN_DELIVERY_COACH_IDS = new Set([PIYUSH_COACH_ID, RAKSHIT_COACH_ID])

/**
 * New paying clients are assigned here after checkout.
 * Independent of plan delivery — Rakshit still takes new clients, then coaches them by hand.
 */
const AUTO_ASSIGN_COACH_IDS = new Set([RAKSHIT_COACH_ID])

export function coachRequiresManualPlanDelivery(coachId: string | null | undefined): boolean {
  return Boolean(coachId && MANUAL_PLAN_DELIVERY_COACH_IDS.has(coachId))
}

/** Only these coaches receive clients via automatic assignment. */
export function coachAcceptsAutoAssignment(coachId: string | null | undefined): boolean {
  return Boolean(coachId && AUTO_ASSIGN_COACH_IDS.has(coachId))
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
