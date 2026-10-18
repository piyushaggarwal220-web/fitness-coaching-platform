import { PREVIEW7_AD_PATH } from '@/lib/analytics/ad-landing'
import { type CoachingPlanSlug } from '@/lib/payments/plans'

/**
 * Prices shown on Shopify theme "Live quiz-v3 2026-08-26 18:09".
 * Checkout uses these only when the order comes from /preview7.
 * The catalog (₹599 / ₹999 / ₹1,699) is unchanged for every other landing.
 */
export const PREVIEW7_DRAFT_PAISE: Record<CoachingPlanSlug, number> = {
  '3_months': 199900,
  '6_months': 349900,
  '12_months': 599900,
}

export function preview7AmountPaise(slug: string | null | undefined): number | null {
  if (!slug || !(slug in PREVIEW7_DRAFT_PAISE)) return null
  return PREVIEW7_DRAFT_PAISE[slug as CoachingPlanSlug]
}

export function isPreview7Landing(path: string | null | undefined): boolean {
  return path === PREVIEW7_AD_PATH
}

export function formatPreview7Inr(paise: number): string {
  const rupees = Math.round(paise / 100)
  return `₹${rupees.toLocaleString('en-IN')}`
}

export function preview7PricedPlan<T extends { slug: string; amountPaise: number; displayPrice: string }>(
  plan: T,
  landingPath: string | null | undefined,
): T {
  if (landingPath !== PREVIEW7_AD_PATH) return plan
  const paise = preview7AmountPaise(plan.slug)
  if (paise == null) return plan
  return { ...plan, amountPaise: paise, displayPrice: formatPreview7Inr(paise) }
}
