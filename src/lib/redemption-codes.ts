import type { SupabaseClient } from '@supabase/supabase-js'
import { maybeAutoAssignCoach } from '@/lib/coach-assignment'
import { getCoachingPlan, type CoachingPlanSlug } from '@/lib/payments/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RedemptionCode } from '@/types/database'

export type ValidateCodeResult = {
  valid: boolean
  error?: string
  code?: Pick<RedemptionCode, 'id' | 'code' | 'plan_slug' | 'duration_months'>
  planName?: string
}

export function normalizeRedemptionCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

export async function validateRedemptionCode(
  code: string,
  supabase?: SupabaseClient
): Promise<ValidateCodeResult> {
  const db = supabase ?? createAdminClient()
  const normalized = normalizeRedemptionCode(code)

  if (!normalized || normalized.length < 4) {
    return { valid: false, error: 'Please enter a valid redemption code.' }
  }

  const { data, error } = await db
    .from('redemption_codes')
    .select('id, code, plan_slug, duration_months, remaining_uses, expires_at, is_active')
    .eq('code', normalized)
    .maybeSingle()

  if (error) return { valid: false, error: error.message }
  if (!data) return { valid: false, error: 'Invalid redemption code.' }
  if (!data.is_active) return { valid: false, error: 'This code is no longer active.' }
  if (data.remaining_uses <= 0) return { valid: false, error: 'This code has been fully redeemed.' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, error: 'This code has expired.' }
  }

  const plan = getCoachingPlan(data.plan_slug)
  if (!plan) return { valid: false, error: 'Code is linked to an invalid plan.' }

  return {
    valid: true,
    code: {
      id: data.id,
      code: data.code,
      plan_slug: data.plan_slug,
      duration_months: data.duration_months,
    },
    planName: plan.name,
  }
}

export type RedeemCodeInput = {
  code: string
  email: string
  password: string
  name: string
  userId?: string
}

export type RedeemCodeResult = {
  userId: string
  isNewUser: boolean
  redirectTo: string
}

export async function redeemCode(input: RedeemCodeInput): Promise<RedeemCodeResult> {
  const admin = createAdminClient()
  const normalized = normalizeRedemptionCode(input.code)
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const password = input.password

  if (password.length < 6) throw new Error('Password must be at least 6 characters')

  const validation = await validateRedemptionCode(normalized, admin)
  if (!validation.valid || !validation.code) {
    throw new Error(validation.error ?? 'Invalid code')
  }

  const { data: codeRow, error: lockError } = await admin
    .from('redemption_codes')
    .select('*')
    .eq('id', validation.code.id)
    .eq('is_active', true)
    .gt('remaining_uses', 0)
    .maybeSingle()

  if (lockError || !codeRow) throw new Error('Code is no longer available.')

  let userId = input.userId ?? null
  let isNewUser = false

  if (!userId) {
    const { findAuthUserIdByEmail } = await import('@/lib/payments/auth-user')
    const existingId = await findAuthUserIdByEmail(admin, email)

    if (existingId) {
      userId = existingId
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      })
      if (createError || !created.user) {
        throw new Error(createError?.message ?? 'Failed to create account')
      }
      userId = created.user.id
      isNewUser = true
    }

    await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { name },
    })
  }

  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + codeRow.duration_months)
  const now = new Date().toISOString()

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    email,
    name,
    role: 'client',
    payment_confirmed: true,
    access_source: 'purchase',
    onboarding_complete: false,
    subscription_expires_at: expiresAt.toISOString(),
    updated_at: now,
  })

  if (profileError) throw new Error(`Failed to grant entitlement: ${profileError.message}`)

  const { error: usageError } = await admin.from('redemption_usages').insert({
    code_id: codeRow.id,
    user_id: userId,
  })

  if (usageError && !usageError.message.includes('duplicate')) {
    throw new Error(`Failed to record redemption: ${usageError.message}`)
  }

  if (!codeRow.is_reusable) {
    await admin
      .from('redemption_codes')
      .update({
        remaining_uses: Math.max(0, codeRow.remaining_uses - 1),
        updated_at: now,
      })
      .eq('id', codeRow.id)
  } else {
    const { count } = await admin
      .from('redemption_usages')
      .select('*', { count: 'exact', head: true })
      .eq('code_id', codeRow.id)

    const used = count ?? 0
    if (used >= codeRow.max_redemptions) {
      await admin
        .from('redemption_codes')
        .update({ remaining_uses: 0, updated_at: now })
        .eq('id', codeRow.id)
    } else {
      await admin
        .from('redemption_codes')
        .update({ remaining_uses: codeRow.max_redemptions - used, updated_at: now })
        .eq('id', codeRow.id)
    }
  }

  await maybeAutoAssignCoach(userId, admin)

  const plan = getCoachingPlan(codeRow.plan_slug as CoachingPlanSlug)
  await admin.from('purchases').insert({
    user_id: userId,
    razorpay_payment_id: `redeem_${codeRow.id}_${userId}`,
    razorpay_order_id: `redeem_order_${codeRow.id}`,
    plan_slug: codeRow.plan_slug,
    plan_name: plan?.name ?? codeRow.plan_slug,
    amount_paise: 0,
    currency: 'INR',
    status: 'redeemed',
    customer_email: email,
    customer_name: name,
  })

  return { userId, isNewUser, redirectTo: '/onboarding' }
}

export type CreateRedemptionCodeInput = {
  code: string
  planSlug: CoachingPlanSlug
  durationMonths: number
  maxRedemptions: number
  expiresAt?: string | null
  isReusable?: boolean
  notes?: string
  createdBy?: string
}

export async function createRedemptionCode(
  input: CreateRedemptionCodeInput,
  supabase?: SupabaseClient
): Promise<{ data: RedemptionCode | null; error: string | null }> {
  const db = supabase ?? createAdminClient()
  const normalized = normalizeRedemptionCode(input.code)
  const now = new Date().toISOString()

  const { data, error } = await db
    .from('redemption_codes')
    .insert({
      code: normalized,
      plan_slug: input.planSlug,
      duration_months: input.durationMonths,
      max_redemptions: input.maxRedemptions,
      remaining_uses: input.maxRedemptions,
      expires_at: input.expiresAt ?? null,
      is_active: true,
      is_reusable: input.isReusable ?? false,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as RedemptionCode, error: null }
}
