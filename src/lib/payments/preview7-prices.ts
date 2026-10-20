import { PREVIEW7_AD_PATH } from '@/lib/analytics/ad-landing'
import { type CoachingPlanSlug } from '@/lib/payments/plans'

/**
 * What /preview7 charges after DIWALI7O or WINTER7O.
 * The checkout sticker is 70% higher until that code is applied.
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

/** Sticker price on /preview7. 70% above the price the sale code charges, rounded to the nearest ₹10. */
export function preview7MarkedUpPaise(payPaise: number): number {
  if (!Number.isFinite(payPaise) || payPaise <= 0) return 0
  return Math.round((payPaise * 17) / 10000) * 1000
}

export function preview7PricedPlan<T extends { slug: string; amountPaise: number; displayPrice: string }>(
  plan: T,
  landingPath: string | null | undefined,
): T {
  if (landingPath !== PREVIEW7_AD_PATH) return plan
  const payPaise = preview7AmountPaise(plan.slug)
  if (payPaise == null) return plan
  const paise = preview7MarkedUpPaise(payPaise)
  return { ...plan, amountPaise: paise, displayPrice: formatPreview7Inr(paise) }
}
