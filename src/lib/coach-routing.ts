import { memberFacingCoachFirstName } from '@/lib/coach-delivery-policy'
import { resolveCoachService, usesHumanCoach, type CoachServiceProfile } from '@/lib/coach-service'

/** ₹1,400. Below this, the client keeps Smart Coach. At or above, they get Piyush. */
export const PIYUSH_HUMAN_COACH_MIN_PAISE = 140_000

export type PaidCoachPurchase = {
  status?: string | null
  amount_paise?: number | null
  refunded_amount_paise?: number | null
  subscription_status?: string | null
  plan_slug?: string | null
}

export function isCoachRoutingAddonSlug(slug: string | null | undefined): boolean {
  if (!slug) return false
  return slug === 'exercise_library' || slug.startsWith('unlock_')
}

/** Cash still kept on a captured purchase. Redeemed codes and add-ons are 0. */
export function capturedNetPaidPaise(row: PaidCoachPurchase): number {
  if ((row.status || '').toLowerCase() !== 'captured') return 0
  if ((row.subscription_status || '').toLowerCase() === 'refunded') return 0
  if (isCoachRoutingAddonSlug(row.plan_slug)) return 0
  const amount = Number(row.amount_paise) || 0
  const refunded = Number(row.refunded_amount_paise) || 0
  return Math.max(0, amount - refunded)
}

export function maxCapturedPaidPaise(rows: PaidCoachPurchase[]): number {
  return rows.reduce((max, row) => Math.max(max, capturedNetPaidPaise(row)), 0)
}

export function paidAmountQualifiesForPiyushHumanCoach(paise: number): boolean {
  return paise >= PIYUSH_HUMAN_COACH_MIN_PAISE
}

export function purchasesQualifyForPiyushHumanCoach(rows: PaidCoachPurchase[]): boolean {
  return paidAmountQualifiesForPiyushHumanCoach(maxCapturedPaidPaise(rows))
}

export function clientChatNavLabel(profile: CoachServiceProfile | null | undefined): string {
  if (!usesHumanCoach(profile)) return 'Smart Coach'
  const name = memberFacingCoachFirstName(profile?.coach_id, profile?.coach_service)
  return name === 'your coach' ? 'Coach' : name
}

export function clientChatPageTitle(profile: CoachServiceProfile | null | undefined): string {
  return resolveCoachService(profile) === 'human' ? clientChatNavLabel(profile) : 'Smart Coach'
}
