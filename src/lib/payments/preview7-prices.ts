import { PREVIEW7_AD_PATH } from '@/lib/analytics/ad-landing'
import { type CoachingPlanSlug } from '@/lib/payments/plans'

/**
 * What /preview7 charges.
 * Same rupees as the catalog. Kept so /preview7 orders keep their own note checks.
 */
export const PREVIEW7_DRAFT_PAISE: Record<CoachingPlanSlug, number> = {
  '3_months': 199900,
  '6_months': 349900,
  '12_months': 599900,
}

/** Previous /preview7 charges. Orders already created at these amounts still verify. */
export const PREVIEW7_LEGACY_PAY_PAISE: Record<CoachingPlanSlug, readonly number[]> = {
  '3_months': [89900, 90000],
  '6_months': [149900, 150000],
  '12_months': [229900, 230000],
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

/**
 * Old /preview7 sticker from the removed sale. Kept so an order already placed
 * at that sticker still verifies. New checkouts charge PREVIEW7_DRAFT_PAISE.
 */
export function preview7MarkedUpPaise(payPaise: number): number {
  if (!Number.isFinite(payPaise) || payPaise <= 0) return 0
  return Math.round((payPaise * 17) / 10000) * 1000
}

const PREVIEW7_SALE_CODES = new Set(['DIWALI7O', 'WINTER7O'])

export function isPreview7SaleCode(raw: string | null | undefined): boolean {
  const code = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return PREVIEW7_SALE_CODES.has(code)
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
