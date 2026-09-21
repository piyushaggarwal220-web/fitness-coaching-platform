import { isDigitalPlanSlug } from '@/lib/payments/plans'
import type { OnboardingProfile } from '@/types/database'

/** Piyush Aggarwal — FIFO work queue; initial plans auto journey + deliver. */
export const PIYUSH_COACH_ID = 'fde68466-fb3e-4a24-a5f2-97a60a363690'
/** Default auto-assign coach for new paying clients. */
export const RAKSHIT_COACH_ID = 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a'

/**
 * Coaches who own ongoing delivery manually (weekly replies, publish from queue).
 * Initial plans for these coaches still auto journey + deliver for eligible clients —
 * see shouldAutoJourneyAndDeliverInitialPlan. Mid-week check-in replies still auto-reply.
 */
const MANUAL_PLAN_DELIVERY_COACH_IDS = new Set([PIYUSH_COACH_ID, RAKSHIT_COACH_ID])

/**
 * New paying clients are assigned here after checkout.
 * Initial diet/workout still auto-generates and delivers for the new cohort.
 */
const AUTO_ASSIGN_COACH_IDS = new Set([RAKSHIT_COACH_ID])

/** Coaches whose eligible clients get AI journey + initial plan auto-delivered. */
const AUTO_INITIAL_PLAN_COACH_IDS = new Set([PIYUSH_COACH_ID, RAKSHIT_COACH_ID])

export const MANUAL_DELIVER_FROM_PLAN_PAGE =
  'Open the plan, add a coach note if needed, then use Deliver to client. Mark complete only clears the queue after the plan is already delivered.'

export function coachRequiresManualPlanDelivery(coachId: string | null | undefined): boolean {
  return Boolean(coachId && MANUAL_PLAN_DELIVERY_COACH_IDS.has(coachId))
}

/** Piyush works first-come, first-served — not by plan tier or task type. */
export function coachUsesFifoWorkQueue(coachId: string | null | undefined): boolean {
  return coachId === PIYUSH_COACH_ID
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

/**
 * Journey-plan setup is required in the work queue (and before initial generate)
 * only for clients who joined on/after this instant — not for the historical roster.
 * 2026-09-13 00:00 IST
 */
export const JOURNEY_SETUP_REQUIRED_FROM_ISO = '2026-09-12T18:30:00.000Z'

/** True when this client should get a journey_setup queue item / generate gate. */
export function clientRequiresJourneySetup(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  const joined = Date.parse(createdAt)
  if (!Number.isFinite(joined)) return false
  return joined >= Date.parse(JOURNEY_SETUP_REQUIRED_FROM_ISO)
}

/**
 * Initial plan jobs are queued automatically for auto-delivery coaches,
 * or for one-time digital customised-plan buyers (AI auto-publish path).
 * Piyush / Rakshit use shouldAutoJourneyAndDeliverInitialPlan instead
 * (AI writes journey first, then generates + delivers).
 */
export function shouldAutoEnqueueInitialPlan(
  profile: Pick<OnboardingProfile, 'coach_id'> | null | undefined,
  options?: { digitalPurchase?: boolean; planSlug?: string | null }
): boolean {
  if (options?.digitalPurchase || isDigitalPlanSlug(options?.planSlug)) return true
  return !clientRequiresManualPlanDelivery(profile)
}

/**
 * Auto journey + initial deliver:
 * - Piyush: unchanged — all his clients stay on the existing auto path.
 * - Rakshit (new default assign): only the new cohort (joined on/after journey cutoff).
 * Historical Rakshit clients stay manual for initial delivery.
 */
export function shouldAutoJourneyAndDeliverInitialPlan(
  coachId: string | null | undefined,
  createdAt?: string | null
): boolean {
  if (!coachId || !AUTO_INITIAL_PLAN_COACH_IDS.has(coachId)) return false
  if (coachId === PIYUSH_COACH_ID) return true
  return clientRequiresJourneySetup(createdAt)
}

/** Mid-week replies stay automatic for every coach. Weekly replies stay manual. */
export function shouldScheduleCheckinAutoReply(
  checkinType: 'mid_week' | 'weekly',
  coachId: string | null | undefined
): boolean {
  if (checkinType === 'mid_week') return true
  return !coachRequiresManualPlanDelivery(coachId)
}

/** Coach notes that mean auto-deliver must hold for human review. */
export function planRequiresCoachReviewBeforeAutoDeliver(
  coachNotes: string | null | undefined
): boolean {
  if (!coachNotes?.trim()) return false
  return /held at\s+\d+\s*kcal floor|please review|requires?\s+review/i.test(coachNotes)
}
