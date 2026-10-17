import { DURATION_OFFER_PLANS, isDurationOfferSlug, type DurationOfferSlug } from '@/lib/payments/plans'

/** One-click code on preview 4, 5, and 6. Catalog price stays in place until it is applied. */
export const PREVIEW_SALE_CODE = 'LURVOX60'
export const PREVIEW_SALE_PERCENT = 60

export function normalizePreviewSaleCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

export function isPreviewSaleCode(raw: string | null | undefined): boolean {
  return normalizePreviewSaleCode(raw) === PREVIEW_SALE_CODE
}

/** Paise taken off the current plan price. Only the preview duration plans qualify. */
export function previewSaleDiscountPaise(listAmountPaise: number): number {
  if (!Number.isFinite(listAmountPaise) || listAmountPaise <= 0) return 0
  return Math.round((listAmountPaise * PREVIEW_SALE_PERCENT) / 100)
}

export function formatPreviewInr(paise: number): string {
  const rupees = paise / 100
  if (Number.isInteger(rupees)) return `₹${rupees.toLocaleString('en-IN')}`
  const [whole, frac] = rupees.toFixed(2).split('.')
  return `₹${Number(whole).toLocaleString('en-IN')}.${frac}`
}

export type PreviewOfferQuote = {
  slug: DurationOfferSlug
  applied: boolean
  listPaise: number
  payPaise: number
  listLabel: string
  payLabel: string
  perMonth: number
  perDay: number
  months: number
}

export function previewOfferQuote(slug: DurationOfferSlug, applied: boolean): PreviewOfferQuote {
  const plan = DURATION_OFFER_PLANS[slug]
  const listPaise = plan.amountPaise
  const discountPaise = applied ? previewSaleDiscountPaise(listPaise) : 0
  const payPaise = listPaise - discountPaise
  const months = plan.durationMonths
  const days = months * 30
  return {
    slug,
    applied,
    listPaise,
    payPaise,
    listLabel: plan.displayPrice,
    payLabel: formatPreviewInr(payPaise),
    perMonth: Math.round(payPaise / 100 / months),
    perDay: Math.ceil(payPaise / 100 / days),
    months,
  }
}

export function previewOfferQuoteForSlug(slug: string, applied: boolean): PreviewOfferQuote | null {
  if (!isDurationOfferSlug(slug)) return null
  return previewOfferQuote(slug, applied)
}
