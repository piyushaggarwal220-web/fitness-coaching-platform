import { isDigitalPlanSlug } from '@/lib/payments/plans'
import type { OnboardingProfile } from '@/types/database'

/** Piyush Aggarwal — FIFO queue; AI handles ongoing delivery; only real calls stay human. */
export const PIYUSH_COACH_ID = 'fde68466-fb3e-4a24-a5f2-97a60a363690'
/** Default auto-assign coach for new paying clients. Same auto-delivery path as Piyush. */
export const RAKSHIT_COACH_ID = 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a'

/**
 * Coaches who own ongoing delivery manually (weekly replies, publish from queue).
 * Piyush and Rakshit are fully automatic except phone calls and chats that need a human.
 * Mid-week replies auto-send for every coach.
 */
const MANUAL_PLAN_DELIVERY_COACH_IDS = new Set<string>()

/**
 * New paying clients are assigned here after checkout.
 * Initial diet/workout auto-generates and delivers for auto-delivery coaches.
 */
const AUTO_ASSIGN_COACH_IDS = new Set([RAKSHIT_COACH_ID])

/** Coaches whose clients get AI journey, chat, check-in replies, and plans auto-delivered. */
export const AUTO_DELIVERY_COACH_IDS = new Set([PIYUSH_COACH_ID, RAKSHIT_COACH_ID])

export const MANUAL_DELIVER_FROM_PLAN_PAGE =
  'Open the plan, add a coach note if needed, then use Deliver to client. Mark complete only clears the queue after the plan is already delivered.'

export function coachRequiresManualPlanDelivery(coachId: string | null | undefined): boolean {
  return Boolean(coachId && MANUAL_PLAN_DELIVERY_COACH_IDS.has(coachId))
}

/** True when AI owns chat, check-ins, plans, and the work queue for this coach. */
export function isAutoDeliveryCoach(coachId: string | null | undefined): boolean {
  return Boolean(coachId && AUTO_DELIVERY_COACH_IDS.has(coachId))
}

export function autoCoachFirstName(coachId: string | null | undefined): string {
  if (coachId === RAKSHIT_COACH_ID) return 'Rakshit'
  if (coachId === PIYUSH_COACH_ID) return 'Piyush'
  return 'your coach'
}

/** Auto-delivery coaches work first-come, first-served — not by plan tier or task type. */
export function coachUsesFifoWorkQueue(coachId: string | null | undefined): boolean {
  return isAutoDeliveryCoach(coachId)
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
 * Auto journey + initial deliver for Piyush and Rakshit clients.
 * `createdAt` is kept so call sites stay compatible; auto-delivery coaches no longer
 * gate on the journey cutoff.
 */
export function shouldAutoJourneyAndDeliverInitialPlan(
  coachId: string | null | undefined,
  _createdAt?: string | null
): boolean {
  return isAutoDeliveryCoach(coachId)
}

/** Mid-week replies stay automatic for every coach. Weekly replies auto-send unless the coach is still on manual delivery. */
export function shouldScheduleCheckinAutoReply(
  checkinType: 'mid_week' | 'weekly',
  coachId: string | null | undefined
): boolean {
  if (checkinType === 'mid_week') return true
  return !coachRequiresManualPlanDelivery(coachId)
}

/** Remaining human work: phone calls, plus chats the AI refuses (refunds, emergencies). */
export function shouldAutoProcessCoachWorkQueue(coachId: string | null | undefined): boolean {
  return isAutoDeliveryCoach(coachId)
}

/** @deprecated Use shouldAutoProcessCoachWorkQueue — both Piyush and Rakshit auto-process. */
export function shouldAutoProcessPiyushWorkQueue(coachId: string | null | undefined): boolean {
  return shouldAutoProcessCoachWorkQueue(coachId)
}

/** Coach notes that mean auto-deliver must hold for human review. */
export function planRequiresCoachReviewBeforeAutoDeliver(
  coachNotes: string | null | undefined
): boolean {
  if (!coachNotes?.trim()) return false
  return /held at\s+\d+\s*kcal floor|please review|requires?\s+review/i.test(coachNotes)
}
