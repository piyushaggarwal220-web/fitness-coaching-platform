import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoachingPlanSlug } from '@/lib/payments/plans'
import type { PromoCode, PromoCodeKind, PromoDiscountType } from '@/types/database'

export type CreatePromoCodeInput = {
  code: string
  kind: PromoCodeKind
  discountType: PromoDiscountType
  discountPaise?: number
  discountPercent?: number
  planDiscountsPaise?: Record<string, number>
  applicablePlans?: string[] | null
  firstTimerOnly?: boolean
  maxRedemptions: number
  expiresAt?: string | null
  referrerLabel?: string | null
  notes?: string | null
  createdBy?: string | null
}

export type UpdatePromoCodeInput = {
  id: string
  code?: string
  kind?: PromoCodeKind
  discountType?: PromoDiscountType
  discountPaise?: number
  discountPercent?: number
  planDiscountsPaise?: Record<string, number>
  applicablePlans?: string[] | null
  firstTimerOnly?: boolean
  maxRedemptions?: number
  remainingUses?: number
  expiresAt?: string | null
  isActive?: boolean
  referrerLabel?: string | null
  notes?: string | null
}

const PAID_PLAN_SLUGS: CoachingPlanSlug[] = ['3_months', '6_months', '12_months']

export function normalizePromoCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

function sanitizePlanDiscounts(
  input: Record<string, number> | null | undefined
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!input) return out
  for (const slug of PAID_PLAN_SLUGS) {
    const value = Number(input[slug])
    if (Number.isFinite(value) && value > 0) out[slug] = Math.round(value)
  }
  return out
}

function validateDiscountShape(input: {
  discountType: PromoDiscountType
  discountPaise: number
  discountPercent: number
  planDiscountsPaise: Record<string, number>
}): string | null {
  if (input.discountType === 'fixed') {
    if (input.discountPaise <= 0) return 'Fixed discount must be greater than ₹0.'
    return null
  }
  if (input.discountType === 'percent') {
    if (input.discountPercent < 1 || input.discountPercent > 90) {
      return 'Percent discount must be between 1 and 90.'
    }
    return null
  }
  if (Object.keys(input.planDiscountsPaise).length === 0) {
    return 'Add at least one per-plan discount amount.'
  }
  return null
}

/** Compute discount paise for a plan from a promo row. */
export function computePromoDiscountPaise(
  promo: Pick<
    PromoCode,
    'discount_type' | 'discount_paise' | 'discount_percent' | 'plan_discounts_paise' | 'applicable_plans'
  >,
  planSlug: string,
  listAmountPaise: number
): number | null {
  const plans = promo.applicable_plans
  if (plans && plans.length > 0 && !plans.includes(planSlug)) return null

  let discountPaise = 0
  if (promo.discount_type === 'fixed') {
    discountPaise = promo.discount_paise
  } else if (promo.discount_type === 'percent') {
    discountPaise = Math.round((listAmountPaise * promo.discount_percent) / 100)
  } else {
    const mapped = Number(promo.plan_discounts_paise?.[planSlug] ?? 0)
    discountPaise = Number.isFinite(mapped) ? mapped : 0
  }

  if (!Number.isFinite(discountPaise) || discountPaise <= 0) return null
  if (discountPaise >= listAmountPaise) return null
  return Math.round(discountPaise)
}

export function isPromoCodeCurrentlyValid(
  promo: Pick<PromoCode, 'is_active' | 'remaining_uses' | 'expires_at'>
): string | null {
  if (!promo.is_active) return 'This code is inactive.'
  if (promo.remaining_uses <= 0) return 'This code has no uses left.'
  if (promo.expires_at) {
    const ends = new Date(promo.expires_at).getTime()
    if (Number.isFinite(ends) && ends < Date.now()) return 'This code has expired.'
  }
  return null
}

export async function getActivePromoCode(
  admin: SupabaseClient,
  rawCode: string
): Promise<{ promo: PromoCode | null; error: string | null }> {
  const code = normalizePromoCode(rawCode)
  if (!code) return { promo: null, error: 'Enter a code.' }

  const { data, error } = await admin
    .from('promo_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (error) return { promo: null, error: error.message }
  if (!data) return { promo: null, error: null }
  return { promo: data as PromoCode, error: null }
}

export async function listPromoCodes(
  admin: SupabaseClient
): Promise<{ codes: PromoCode[]; error: string | null }> {
  const { data, error } = await admin
    .from('promo_codes')
    .select('*, promo_code_usages(id, customer_email, plan_slug, discount_paise, used_at)')
    .order('created_at', { ascending: false })

  if (error) return { codes: [], error: error.message }
  return { codes: (data ?? []) as PromoCode[], error: null }
}

export async function createPromoCode(
  input: CreatePromoCodeInput,
  admin: SupabaseClient
): Promise<{ data: PromoCode | null; error: string | null }> {
  const code = normalizePromoCode(input.code)
  if (!code || code.length < 3) return { data: null, error: 'Code must be at least 3 characters.' }
  if (input.kind !== 'discount' && input.kind !== 'referral') {
    return { data: null, error: 'Kind must be discount or referral.' }
  }
  if (!['fixed', 'percent', 'plan_fixed'].includes(input.discountType)) {
    return { data: null, error: 'Invalid discount type.' }
  }

  const discountPaise = Math.max(0, Math.round(Number(input.discountPaise ?? 0)))
  const discountPercent = Math.max(0, Math.round(Number(input.discountPercent ?? 0)))
  const planDiscountsPaise = sanitizePlanDiscounts(input.planDiscountsPaise)
  const shapeError = validateDiscountShape({
    discountType: input.discountType,
    discountPaise,
    discountPercent,
    planDiscountsPaise,
  })
  if (shapeError) return { data: null, error: shapeError }

  const maxRedemptions = Math.max(1, Math.round(Number(input.maxRedemptions) || 1))
  const applicablePlans =
    input.applicablePlans && input.applicablePlans.length > 0
      ? input.applicablePlans.filter((p) => PAID_PLAN_SLUGS.includes(p as CoachingPlanSlug))
      : null

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('promo_codes')
    .insert({
      code,
      kind: input.kind,
      discount_type: input.discountType,
      discount_paise: discountPaise,
      discount_percent: discountPercent,
      plan_discounts_paise: planDiscountsPaise,
      applicable_plans: applicablePlans,
      first_timer_only: Boolean(input.firstTimerOnly),
      max_redemptions: maxRedemptions,
      remaining_uses: maxRedemptions,
      expires_at: input.expiresAt || null,
      is_active: true,
      referrer_label: input.referrerLabel?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: input.createdBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !data) {
    if (error?.code === '23505') return { data: null, error: 'That code already exists.' }
    return { data: null, error: error?.message ?? 'Could not create code.' }
  }
  return { data: data as PromoCode, error: null }
}

export async function updatePromoCode(
  input: UpdatePromoCodeInput,
  admin: SupabaseClient
): Promise<{ data: PromoCode | null; error: string | null }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.code !== undefined) {
    const code = normalizePromoCode(input.code)
    if (!code || code.length < 3) return { data: null, error: 'Code must be at least 3 characters.' }
    patch.code = code
  }
  if (input.kind !== undefined) patch.kind = input.kind
  if (input.discountType !== undefined) patch.discount_type = input.discountType
  if (input.discountPaise !== undefined) patch.discount_paise = Math.max(0, Math.round(input.discountPaise))
  if (input.discountPercent !== undefined) {
    patch.discount_percent = Math.max(0, Math.round(input.discountPercent))
  }
  if (input.planDiscountsPaise !== undefined) {
    patch.plan_discounts_paise = sanitizePlanDiscounts(input.planDiscountsPaise)
  }
  if (input.applicablePlans !== undefined) {
    patch.applicable_plans =
      input.applicablePlans && input.applicablePlans.length > 0
        ? input.applicablePlans.filter((p) => PAID_PLAN_SLUGS.includes(p as CoachingPlanSlug))
        : null
  }
  if (input.firstTimerOnly !== undefined) patch.first_timer_only = Boolean(input.firstTimerOnly)
  if (input.maxRedemptions !== undefined) {
    patch.max_redemptions = Math.max(1, Math.round(input.maxRedemptions))
  }
  if (input.remainingUses !== undefined) {
    patch.remaining_uses = Math.max(0, Math.round(input.remainingUses))
  }
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt || null
  if (input.isActive !== undefined) patch.is_active = Boolean(input.isActive)
  if (input.referrerLabel !== undefined) patch.referrer_label = input.referrerLabel?.trim() || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null

  const { data, error } = await admin
    .from('promo_codes')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .maybeSingle()

  if (error || !data) {
    if (error?.code === '23505') return { data: null, error: 'That code already exists.' }
    return { data: null, error: error?.message ?? 'Could not update code.' }
  }
  return { data: data as PromoCode, error: null }
}

/** Best-effort usage recording after a successful paid checkout. */
export async function recordPromoCodeUsage(
  admin: SupabaseClient,
  input: {
    code: string
    purchaseId?: string | null
    customerEmail: string
    planSlug: string
    discountPaise: number
  }
): Promise<void> {
  const code = normalizePromoCode(input.code)
  if (!code) return

  const { data: promo } = await admin
    .from('promo_codes')
    .select('id, remaining_uses')
    .eq('code', code)
    .maybeSingle()
  if (!promo) return

  // Idempotent when both verify + webhook fire for the same purchase.
  if (input.purchaseId) {
    const { data: existing } = await admin
      .from('promo_code_usages')
      .select('id')
      .eq('purchase_id', input.purchaseId)
      .maybeSingle()
    if (existing) return
  }

  await admin.from('promo_code_usages').insert({
    promo_code_id: promo.id,
    purchase_id: input.purchaseId ?? null,
    customer_email: input.customerEmail.trim().toLowerCase(),
    plan_slug: input.planSlug,
    discount_paise: Math.max(0, Math.round(input.discountPaise)),
  })

  if (typeof promo.remaining_uses === 'number' && promo.remaining_uses > 0) {
    await admin
      .from('promo_codes')
      .update({
        remaining_uses: promo.remaining_uses - 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promo.id)
  }
}
