import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getPurchasablePlan,
  type CoachingPlan,
  type CoachingPlanSlug,
} from '@/lib/payments/plans'

/** Default public first-timer promo code (override with FIRST_TIMER_DISCOUNT_CODE). */
export const DEFAULT_FIRST_TIMER_DISCOUNT_CODE = 'WELCOME'

/** Fixed first-timer discounts by plan (paise). */
export const FIRST_TIMER_DISCOUNT_PAISE: Record<CoachingPlanSlug, number> = {
  '3_months': 20000, // ₹200
  '6_months': 30000, // ₹300
  '12_months': 40000, // ₹400
}

export type CheckoutDiscountKind = 'first_timer'

export type AppliedCheckoutDiscount = {
  kind: CheckoutDiscountKind
  code: string
  discountPaise: number
  discountInr: number
  listAmountPaise: number
  amountPaise: number
  displayListPrice: string
  displaySalePrice: string
  displayDiscount: string
}

export type CheckoutPricing = {
  plan: CoachingPlan
  listAmountPaise: number
  amountPaise: number
  discount: AppliedCheckoutDiscount | null
}

export function normalizeDiscountCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

export function getFirstTimerDiscountCode(): string {
  const fromEnv = process.env.FIRST_TIMER_DISCOUNT_CODE?.trim()
  if (fromEnv) return normalizeDiscountCode(fromEnv)
  return DEFAULT_FIRST_TIMER_DISCOUNT_CODE
}

export function isFirstTimerDiscountCode(raw: string | null | undefined): boolean {
  const code = normalizeDiscountCode(raw)
  return Boolean(code) && code === getFirstTimerDiscountCode()
}

export function formatInrFromPaise(paise: number): string {
  const rupees = Math.round(paise / 100)
  return `₹${rupees.toLocaleString('en-IN')}`
}

export function discountPaiseForPlan(planSlug: string): number | null {
  if (!(planSlug in FIRST_TIMER_DISCOUNT_PAISE)) return null
  return FIRST_TIMER_DISCOUNT_PAISE[planSlug as CoachingPlanSlug]
}

/** True when this email has never successfully paid or redeemed enrollment. */
export async function isFirstTimerEmail(
  admin: SupabaseClient,
  email: string
): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false

  const { data, error } = await admin
    .from('purchases')
    .select('id')
    .eq('customer_email', normalized)
    .in('status', ['captured', 'redeemed'])
    .limit(1)

  if (error) {
    throw new Error(`Could not verify first-timer eligibility: ${error.message}`)
  }

  return !data || data.length === 0
}

export type ResolveDiscountResult =
  | { ok: true; pricing: CheckoutPricing }
  | { ok: false; error: string; status: number; enrollmentCode?: boolean }

/**
 * Resolve list vs payable amount for a plan, optionally applying the first-timer code.
 * Empty code → full catalog price.
 */
export async function resolveCheckoutPricing(input: {
  admin: SupabaseClient
  planSlug: string
  email: string
  discountCode?: string | null
}): Promise<ResolveDiscountResult> {
  const plan = getPurchasablePlan(input.planSlug)
  if (!plan) {
    return { ok: false, error: 'Invalid plan selected', status: 400 }
  }

  const listAmountPaise = plan.amountPaise
  const code = normalizeDiscountCode(input.discountCode)

  if (!code) {
    return {
      ok: true,
      pricing: {
        plan,
        listAmountPaise,
        amountPaise: listAmountPaise,
        discount: null,
      },
    }
  }

  if (!isFirstTimerDiscountCode(code)) {
    // Caller may check enrollment codes separately; treat unknown discount codes as invalid here.
    return {
      ok: false,
      error: `Invalid discount code. First-timer code is ${getFirstTimerDiscountCode()}. Enrollment / membership codes are redeemed on the enrollment page.`,
      status: 400,
    }
  }

  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return {
      ok: false,
      error: 'Enter a valid email before applying a first-timer discount.',
      status: 400,
    }
  }

  let firstTimer = false
  try {
    firstTimer = await isFirstTimerEmail(input.admin, email)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not verify discount eligibility',
      status: 500,
    }
  }

  if (!firstTimer) {
    return {
      ok: false,
      error: 'This discount is for first-time customers only. This email already has a purchase or enrollment.',
      status: 400,
    }
  }

  const discountPaise = discountPaiseForPlan(plan.slug)
  if (discountPaise == null || discountPaise <= 0 || discountPaise >= listAmountPaise) {
    return { ok: false, error: 'Discount is not available for this plan.', status: 400 }
  }

  const amountPaise = listAmountPaise - discountPaise
  const discount: AppliedCheckoutDiscount = {
    kind: 'first_timer',
    code: getFirstTimerDiscountCode(),
    discountPaise,
    discountInr: discountPaise / 100,
    listAmountPaise,
    amountPaise,
    displayListPrice: formatInrFromPaise(listAmountPaise),
    displaySalePrice: formatInrFromPaise(amountPaise),
    displayDiscount: formatInrFromPaise(discountPaise),
  }

  return {
    ok: true,
    pricing: {
      plan,
      listAmountPaise,
      amountPaise,
      discount,
    },
  }
}

/** Expected payable amount from Razorpay order notes (falls back to catalog). */
export function expectedAmountPaiseFromOrderNotes(
  plan: CoachingPlan,
  notes: Record<string, string | undefined> | null | undefined
): number {
  const charged = notes?.amount_paise ? Number(notes.amount_paise) : NaN
  if (Number.isFinite(charged) && charged > 0) {
    const discountPaise = notes?.discount_paise ? Number(notes.discount_paise) : 0
    const code = normalizeDiscountCode(notes?.discount_code)
    if (code && isFirstTimerDiscountCode(code)) {
      const expectedDiscount = discountPaiseForPlan(plan.slug) ?? 0
      if (discountPaise === expectedDiscount && charged === plan.amountPaise - expectedDiscount) {
        return charged
      }
    }
    if (!code && charged === plan.amountPaise) {
      return charged
    }
  }

  const discountPaise = notes?.discount_paise ? Number(notes.discount_paise) : 0
  const code = normalizeDiscountCode(notes?.discount_code)
  if (code && isFirstTimerDiscountCode(code) && discountPaise > 0) {
    const expectedDiscount = discountPaiseForPlan(plan.slug) ?? 0
    if (discountPaise === expectedDiscount) {
      return plan.amountPaise - expectedDiscount
    }
  }

  return plan.amountPaise
}

export function checkoutDiscountNotes(pricing: CheckoutPricing): Record<string, string> {
  if (!pricing.discount) {
    return {
      amount_paise: String(pricing.amountPaise),
      list_amount_paise: String(pricing.listAmountPaise),
    }
  }

  return {
    amount_paise: String(pricing.amountPaise),
    list_amount_paise: String(pricing.listAmountPaise),
    discount_paise: String(pricing.discount.discountPaise),
    discount_code: pricing.discount.code,
    discount_kind: pricing.discount.kind,
  }
}
