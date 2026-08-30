import type { SupabaseClient } from '@supabase/supabase-js'
import {
  affiliateDiscountPaise,
  getAffiliateCode,
  isAffiliateDiscountCode,
} from '@/lib/payments/affiliate-codes'
import {
  getPurchasablePlan,
  type CoachingPlan,
  type CoachingPlanSlug,
} from '@/lib/payments/plans'
import {
  computePromoDiscountPaise,
  getActivePromoCode,
  isPromoCodeCurrentlyValid,
} from '@/lib/payments/promo-codes'
import type { PromoCodeKind } from '@/types/database'

/** Default public promo code (override with FIRST_TIMER_DISCOUNT_CODE). Open to all customers. */
export const DEFAULT_FIRST_TIMER_DISCOUNT_CODE = 'WELCOME60'

type FirstTimerPlanSlug = CoachingPlanSlug

/** Public sale percent off list price. Trial is not eligible. Available to all customers. */
export const FIRST_TIMER_DISCOUNT_PERCENT = 60

/**
 * Legacy WELCOME60 sale targets — aligned with catalog list prices (no standing discount).
 * Promo codes can still reduce below these amounts at checkout.
 */
export const FIRST_TIMER_SALE_PAISE: Record<FirstTimerPlanSlug, number> = {
  '3_months': 179900,
  '6_months': 279900,
  '12_months': 449900,
}

const FIRST_TIMER_PLAN_SLUGS = new Set<string>(['3_months', '6_months', '12_months'])

/**
 * Optional paid add-on: a personalised supplement protocol built from the client's onboarding
 * answers (what is worth taking for their goal and budget, dosing, timing, what to skip).
 *
 * Charged as its own line on top of the discounted plan price — promo codes apply to coaching
 * only, so the add-on is never silently discounted or double-counted.
 */
export const SUPPLEMENT_PROTOCOL_ADDON_PAISE = 39900
export const SUPPLEMENT_PROTOCOL_ADDON_LABEL = 'Natural testosterone support protocol'
/** Protocol add-ons stay at this published price. */
export const CHECKOUT_ADDON_UNIT_PAISE = SUPPLEMENT_PROTOCOL_ADDON_PAISE
/** Form videos for lifts in the workout tracker. Sold in-app, not on checkout. */
export const EXERCISE_LIBRARY_ADDON_PAISE = 34900
export const EXERCISE_LIBRARY_ADDON_LABEL = 'Exercise form videos'
export const EXERCISE_LIBRARY_ADDON_ID = 'exercise_library' as const

export const CHECKOUT_ADDON_IDS = [
  'testo_boost',
  'anxiety_removal',
  'face_maxxing',
  EXERCISE_LIBRARY_ADDON_ID,
] as const
export type CheckoutAddonId = (typeof CHECKOUT_ADDON_IDS)[number]

export const CHECKOUT_ADDON_PRICE_PAISE: Record<CheckoutAddonId, number> = {
  testo_boost: SUPPLEMENT_PROTOCOL_ADDON_PAISE,
  anxiety_removal: SUPPLEMENT_PROTOCOL_ADDON_PAISE,
  face_maxxing: SUPPLEMENT_PROTOCOL_ADDON_PAISE,
  exercise_library: EXERCISE_LIBRARY_ADDON_PAISE,
}

export const CHECKOUT_ADDONS: { id: CheckoutAddonId; name: string; copy: string }[] = [
  {
    id: 'testo_boost',
    name: 'Testo boost',
    copy: 'A written protocol from your answers: training, sleep, body fat, and which supplements are worth it. Not a hormone or drug.',
  },
  {
    id: 'anxiety_removal',
    name: 'Anxiety removal',
    copy: 'Coach-built habits for stress, sleep, and a calmer week. Not therapy and not medicine.',
  },
  {
    id: 'face_maxxing',
    name: 'Face maxxing',
    copy: 'Face-focused habits: sleep, salt, skin, posture, and grooming. Lifestyle only — not a medical or surgical plan.',
  },
  {
    id: 'exercise_library',
    name: 'Exercise form videos',
    copy: 'Form videos for every lift in your workout tracker. Front view loads first; extra angles load only if you tap them.',
  },
]

export function checkoutAddonPaise(id: CheckoutAddonId): number {
  return CHECKOUT_ADDON_PRICE_PAISE[id]
}

/** Published à-la-carte total if every add-on is bought separately. */
export const CHECKOUT_ADDON_BUNDLE_LIST_PAISE = CHECKOUT_ADDON_IDS.reduce(
  (sum, id) => sum + CHECKOUT_ADDON_PRICE_PAISE[id],
  0
)
/** Checkout offer: all add-ons together. */
export const CHECKOUT_ADDON_BUNDLE_PAISE = 99900

export function checkoutAddonsListPaise(ids: readonly CheckoutAddonId[]): number {
  return ids.reduce((sum, id) => sum + CHECKOUT_ADDON_PRICE_PAISE[id], 0)
}

export function isCheckoutAddonBundle(ids: readonly CheckoutAddonId[]): boolean {
  return CHECKOUT_ADDON_IDS.every((id) => ids.includes(id))
}

export function isExerciseLibraryAddon(id: string | null | undefined): boolean {
  return id === EXERCISE_LIBRARY_ADDON_ID
}

/** Razorpay order-note key, also used to reconstruct the charge at verification time. */
const SUPPLEMENT_ADDON_NOTE_KEY = 'addon_supplement_paise'
const CHECKOUT_ADDON_IDS_NOTE_KEY = 'addon_ids'
const CHECKOUT_ADDON_TOTAL_NOTE_KEY = 'addon_total_paise'

export function parseCheckoutAddonIds(input: unknown): CheckoutAddonId[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,\s]+/)
      : []
  const allowed = new Set<string>(CHECKOUT_ADDON_IDS)
  const ids: CheckoutAddonId[] = []
  for (const value of raw) {
    const id = String(value ?? '').trim()
    if (allowed.has(id) && !ids.includes(id as CheckoutAddonId)) {
      ids.push(id as CheckoutAddonId)
    }
  }
  return ids
}

export function checkoutAddonsPaise(ids: readonly CheckoutAddonId[]): number {
  if (isCheckoutAddonBundle(ids)) return CHECKOUT_ADDON_BUNDLE_PAISE
  return checkoutAddonsListPaise(ids)
}

export function supplementAddonPaise(enabled: boolean | null | undefined): number {
  return enabled ? SUPPLEMENT_PROTOCOL_ADDON_PAISE : 0
}

export function checkoutAddonsFromNotes(
  notes: Record<string, string | undefined> | null | undefined
): { ids: CheckoutAddonId[]; paise: number } {
  const ids = parseCheckoutAddonIds(notes?.[CHECKOUT_ADDON_IDS_NOTE_KEY])
  const total = notes?.[CHECKOUT_ADDON_TOTAL_NOTE_KEY]
    ? Number(notes[CHECKOUT_ADDON_TOTAL_NOTE_KEY])
    : NaN
  // Trust the amount written onto the Razorpay order so older add-on carts still verify
  // after catalogue prices change. New checkout orders do not attach add-ons.
  if (ids.length > 0 && Number.isFinite(total) && total >= 0) {
    return { ids, paise: total }
  }
  if (supplementAddonPaiseFromNotes(notes) > 0) {
    return { ids: ['testo_boost'], paise: SUPPLEMENT_PROTOCOL_ADDON_PAISE }
  }
  return { ids: [], paise: 0 }
}

/** Amount actually charged: discounted coaching plan plus selected add-ons. */
export function checkoutTotalPaise(
  pricing: Pick<CheckoutPricing, 'amountPaise'>,
  addons: boolean | readonly CheckoutAddonId[] | null | undefined
): number {
  if (Array.isArray(addons)) return pricing.amountPaise + checkoutAddonsPaise(addons)
  return pricing.amountPaise + supplementAddonPaise(Boolean(addons))
}

/** Add-on amount recorded on the Razorpay order, so verify/webhook can trust it. */
export function supplementAddonPaiseFromNotes(
  notes: Record<string, string | undefined> | null | undefined
): number {
  const raw = notes?.[SUPPLEMENT_ADDON_NOTE_KEY]
  const value = raw ? Number(raw) : NaN
  // Only the exact published price is honoured — a tampered note cannot inflate the expected total.
  return value === SUPPLEMENT_PROTOCOL_ADDON_PAISE ? SUPPLEMENT_PROTOCOL_ADDON_PAISE : 0
}

export type CheckoutDiscountKind = 'first_timer' | 'discount' | 'referral'

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
  referrerLabel?: string | null
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

export function discountPaiseForPlan(
  planSlug: string,
  listAmountPaise?: number
): number | null {
  if (!FIRST_TIMER_PLAN_SLUGS.has(planSlug)) return null
  const list =
    listAmountPaise ??
    getPurchasablePlan(planSlug)?.amountPaise
  if (!list || list <= 0) return null
  const sale = FIRST_TIMER_SALE_PAISE[planSlug as FirstTimerPlanSlug]
  if (sale != null && sale > 0) {
    if (sale >= list) return 0
    return list - sale
  }
  return Math.round((list * FIRST_TIMER_DISCOUNT_PERCENT) / 100)
}

/** Payable amount after WELCOME60 / public sale percent off. */
export function firstTimerSalePaise(
  planSlug: string,
  listAmountPaise?: number
): number | null {
  if (!FIRST_TIMER_PLAN_SLUGS.has(planSlug)) return null
  const fixed = FIRST_TIMER_SALE_PAISE[planSlug as FirstTimerPlanSlug]
  if (fixed != null) return fixed
  const list =
    listAmountPaise ??
    getPurchasablePlan(planSlug)?.amountPaise
  const discount = discountPaiseForPlan(planSlug, list)
  if (!list || discount == null) return null
  return list - discount
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

function buildAppliedDiscount(input: {
  kind: CheckoutDiscountKind
  code: string
  discountPaise: number
  listAmountPaise: number
  referrerLabel?: string | null
}): AppliedCheckoutDiscount {
  const amountPaise = input.listAmountPaise - input.discountPaise
  return {
    kind: input.kind,
    code: input.code,
    discountPaise: input.discountPaise,
    discountInr: input.discountPaise / 100,
    listAmountPaise: input.listAmountPaise,
    amountPaise,
    displayListPrice: formatInrFromPaise(input.listAmountPaise),
    displaySalePrice: formatInrFromPaise(amountPaise),
    displayDiscount: formatInrFromPaise(input.discountPaise),
    referrerLabel: input.referrerLabel ?? null,
  }
}

/**
 * Resolve list vs payable amount for a plan, optionally applying a promo / referral code.
 * Empty code → full catalog price.
 *
 * Pass `enforceEligibility: false` (or omit email) for checkout preview before the
 * customer types an email. Create-order must pass a real email with enforcement on
 * so promo validity is checked before charging.
 *
 * Public WELCOME60 (and matching env code) is available to everyone — not first-timer only.
 */
export async function resolveCheckoutPricing(input: {
  admin: SupabaseClient
  planSlug: string
  email?: string | null
  discountCode?: string | null
  enforceEligibility?: boolean
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

  if (plan.isTrial) {
    return {
      ok: false,
      error: 'Discount / referral codes cannot be applied to the trial.',
      status: 400,
    }
  }

  const email = (input.email ?? '').trim().toLowerCase()
  const hasEmail = Boolean(email && email.includes('@'))
  const enforceEligibility = input.enforceEligibility ?? true

  if (enforceEligibility && !hasEmail) {
    return {
      ok: false,
      error: 'Enter a valid email before applying a code.',
      status: 400,
    }
  }

  async function assertFirstTimerIfNeeded(required: boolean): Promise<ResolveDiscountResult | null> {
    // Public sale / affiliate codes are open to renewals and returning customers too.
    if (isFirstTimerDiscountCode(code) || isAffiliateDiscountCode(code)) return null
    if (!required || !enforceEligibility || !hasEmail) return null
    let firstTimer = false
    try {
      firstTimer = await isFirstTimerEmail(input.admin, email)
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not verify first-timer eligibility',
        status: 500,
      }
    }
    if (!firstTimer) {
      return {
        ok: false,
        error:
          'This code is for first-time customers only. This email already has a purchase or enrollment.',
        status: 400,
      }
    }
    return null
  }

  // Affiliate codes (e.g. LUKE): sale price + extra % off. Prefer hard-coded math so
  // storefront sale targets stay authoritative even if the admin promo row drifts.
  const affiliate = getAffiliateCode(code)
  if (affiliate) {
    const { promo, error: promoLookupError } = await getActivePromoCode(input.admin, code)
    if (promoLookupError) {
      return { ok: false, error: promoLookupError, status: 500 }
    }
    if (promo) {
      const validityError = isPromoCodeCurrentlyValid(promo)
      if (validityError) return { ok: false, error: validityError, status: 400 }
    }

    const discountPaise = affiliateDiscountPaise(code, plan.slug, listAmountPaise)
    if (discountPaise == null) {
      return { ok: false, error: 'This code is not available for this plan.', status: 400 }
    }

    const discount = buildAppliedDiscount({
      kind: 'referral',
      code: affiliate.code,
      discountPaise,
      listAmountPaise,
      referrerLabel: promo?.referrer_label || affiliate.referrerLabel,
    })

    return {
      ok: true,
      pricing: {
        plan,
        listAmountPaise,
        amountPaise: discount.amountPaise,
        discount,
      },
    }
  }

  // Prefer admin-managed promo_codes rows.
  const { promo, error: promoLookupError } = await getActivePromoCode(input.admin, code)
  if (promoLookupError) {
    return { ok: false, error: promoLookupError, status: 500 }
  }

  if (promo) {
    const validityError = isPromoCodeCurrentlyValid(promo)
    if (validityError) return { ok: false, error: validityError, status: 400 }

    const firstTimerBlock = await assertFirstTimerIfNeeded(Boolean(promo.first_timer_only))
    if (firstTimerBlock) return firstTimerBlock

    const discountPaise = computePromoDiscountPaise(promo, plan.slug, listAmountPaise)
    if (discountPaise == null) {
      return { ok: false, error: 'This code is not available for this plan.', status: 400 }
    }

    const kind: CheckoutDiscountKind =
      promo.kind === 'referral'
        ? 'referral'
        : isFirstTimerDiscountCode(promo.code) || !promo.first_timer_only
          ? 'discount'
          : 'first_timer'
    const discount = buildAppliedDiscount({
      kind,
      code: promo.code,
      discountPaise,
      listAmountPaise,
      referrerLabel: promo.referrer_label,
    })

    return {
      ok: true,
      pricing: {
        plan,
        listAmountPaise,
        amountPaise: discount.amountPaise,
        discount,
      },
    }
  }

  // Legacy env/default WELCOME path when no DB row exists yet.
  if (!isFirstTimerDiscountCode(code)) {
    return {
      ok: false,
      error: 'Invalid code. Enrollment / membership codes are redeemed on the enrollment page.',
      status: 400,
    }
  }

  const discountPaise = discountPaiseForPlan(plan.slug, listAmountPaise)
  if (discountPaise == null || discountPaise <= 0 || discountPaise >= listAmountPaise) {
    return { ok: false, error: 'This referral code is not available for this plan.', status: 400 }
  }

  const discount = buildAppliedDiscount({
    kind: 'discount',
    code: getFirstTimerDiscountCode(),
    discountPaise,
    listAmountPaise,
  })

  return {
    ok: true,
    pricing: {
      plan,
      listAmountPaise,
      amountPaise: discount.amountPaise,
      discount,
    },
  }
}

/**
 * Expected payable amount from Razorpay order notes (falls back to catalog).
 *
 * `amount_paise` covers coaching only, so the add-on is validated separately and added on top —
 * that keeps every existing discount check working unchanged.
 */
export function expectedAmountPaiseFromOrderNotes(
  plan: CoachingPlan,
  notes: Record<string, string | undefined> | null | undefined
): number {
  return expectedPlanAmountPaiseFromOrderNotes(plan, notes) + checkoutAddonsFromNotes(notes).paise
}

/** Expected coaching-only amount, before any add-on. */
function expectedPlanAmountPaiseFromOrderNotes(
  plan: CoachingPlan,
  notes: Record<string, string | undefined> | null | undefined
): number {
  const charged = notes?.amount_paise ? Number(notes.amount_paise) : NaN
  const listFromNotes = notes?.list_amount_paise ? Number(notes.list_amount_paise) : NaN
  const discountPaise = notes?.discount_paise ? Number(notes.discount_paise) : 0
  const code = normalizeDiscountCode(notes?.discount_code)

  if (Number.isFinite(charged) && charged > 0) {
    const listAmount = Number.isFinite(listFromNotes) && listFromNotes > 0 ? listFromNotes : plan.amountPaise

    // Generic admin promo / referral / affiliate codes created at order time.
    if (
      code &&
      listAmount === plan.amountPaise &&
      Number.isFinite(discountPaise) &&
      discountPaise > 0 &&
      charged === listAmount - discountPaise
    ) {
      return charged
    }

    if (code && isAffiliateDiscountCode(code)) {
      const expectedDiscount = affiliateDiscountPaise(code, plan.slug, plan.amountPaise) ?? 0
      if (discountPaise === expectedDiscount && charged === plan.amountPaise - expectedDiscount) {
        return charged
      }
    }

    if (code && isFirstTimerDiscountCode(code)) {
      const expectedDiscount = discountPaiseForPlan(plan.slug, plan.amountPaise) ?? 0
      if (discountPaise === expectedDiscount && charged === plan.amountPaise - expectedDiscount) {
        return charged
      }
    }

    if (!code && charged === plan.amountPaise) {
      return charged
    }
  }

  if (code && isFirstTimerDiscountCode(code) && discountPaise > 0) {
    const expectedDiscount = discountPaiseForPlan(plan.slug, plan.amountPaise) ?? 0
    if (discountPaise === expectedDiscount) {
      return plan.amountPaise - expectedDiscount
    }
  }

  return plan.amountPaise
}

export function checkoutDiscountNotes(
  pricing: CheckoutPricing,
  options?: { supplementAddon?: boolean | null; addonIds?: readonly CheckoutAddonId[] | null }
): Record<string, string> {
  const notes: Record<string, string> = {
    amount_paise: String(pricing.amountPaise),
    list_amount_paise: String(pricing.listAmountPaise),
  }

  if (pricing.discount) {
    notes.discount_paise = String(pricing.discount.discountPaise)
    notes.discount_code = pricing.discount.code
    notes.discount_kind = pricing.discount.kind
    if (pricing.discount.referrerLabel) {
      notes.referrer_label = pricing.discount.referrerLabel
    }
  }

  const addonIds = parseCheckoutAddonIds(options?.addonIds ?? (options?.supplementAddon ? ['testo_boost'] : []))
  if (addonIds.length > 0) {
    notes[CHECKOUT_ADDON_IDS_NOTE_KEY] = addonIds.join(',')
    notes[CHECKOUT_ADDON_TOTAL_NOTE_KEY] = String(checkoutAddonsPaise(addonIds))
    if (addonIds.includes('testo_boost')) {
      notes[SUPPLEMENT_ADDON_NOTE_KEY] = String(SUPPLEMENT_PROTOCOL_ADDON_PAISE)
    }
  }

  return notes
}

export function promoKindLabel(kind: PromoCodeKind | CheckoutDiscountKind): string {
  if (kind === 'referral') return 'Referral'
  if (kind === 'first_timer') return 'Promo'
  return 'Discount'
}
