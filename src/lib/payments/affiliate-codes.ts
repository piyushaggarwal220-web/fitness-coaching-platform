import { getPurchasablePlan, type CoachingPlanSlug } from '@/lib/payments/plans'

type PaidPlanSlug = Exclude<CoachingPlanSlug, '1_week_trial'>

/** Public storefront sale prices that affiliate extras stack on (must match checkout-discounts). */
const PUBLIC_SALE_PAISE: Record<PaidPlanSlug, number> = {
  '3_months': 149900,
  '6_months': 269900,
  '12_months': 349900,
}

export type AffiliateCodeConfig = {
  code: string
  referrerLabel: string
  /** Extra percent off the public sale prices (1499 / 2699 / 3499). */
  extraPercentOffSale: number
  notes: string
}

/** Hard-coded affiliate / partner codes stacked on public sale pricing. */
export const AFFILIATE_CODES: Record<string, AffiliateCodeConfig> = {
  LUKE: {
    code: 'LUKE',
    referrerLabel: 'Luke',
    extraPercentOffSale: 5,
    notes:
      'Affiliate code for Luke — public sale (₹1,499 / ₹2,699 / ₹3,499) plus an extra 5% off. Team is emailed on each successful use.',
  },
}

export function getAffiliateCode(raw: string | null | undefined): AffiliateCodeConfig | null {
  const code = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!code) return null
  return AFFILIATE_CODES[code] ?? null
}

export function isAffiliateDiscountCode(raw: string | null | undefined): boolean {
  return getAffiliateCode(raw) != null
}

/**
 * Payable amount for an affiliate code: sale price minus extra percent,
 * rounded to whole rupees (e.g. ₹1,499 → ₹1,424).
 */
export function affiliateSalePaise(
  rawCode: string | null | undefined,
  planSlug: string
): number | null {
  const affiliate = getAffiliateCode(rawCode)
  if (!affiliate) return null
  if (!(planSlug in PUBLIC_SALE_PAISE)) return null
  const salePaise = PUBLIC_SALE_PAISE[planSlug as PaidPlanSlug]
  if (!salePaise || salePaise <= 0) return null
  const saleRupees = Math.round(salePaise / 100)
  const finalRupees = Math.round(saleRupees * (1 - affiliate.extraPercentOffSale / 100))
  if (finalRupees <= 0 || finalRupees >= saleRupees) return null
  return finalRupees * 100
}

/** Total discount from list MRP when an affiliate code is applied. */
export function affiliateDiscountPaise(
  rawCode: string | null | undefined,
  planSlug: string,
  listAmountPaise?: number
): number | null {
  const finalPaise = affiliateSalePaise(rawCode, planSlug)
  if (finalPaise == null) return null
  const list = listAmountPaise ?? getPurchasablePlan(planSlug)?.amountPaise
  if (!list || list <= finalPaise) return null
  return list - finalPaise
}

/** Per-plan discount map (paise off list) for seeding / admin display. */
export function affiliatePlanDiscountsPaise(
  rawCode: string | null | undefined
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const slug of Object.keys(PUBLIC_SALE_PAISE)) {
    const discount = affiliateDiscountPaise(rawCode, slug)
    if (discount != null) out[slug] = discount
  }
  return out
}
