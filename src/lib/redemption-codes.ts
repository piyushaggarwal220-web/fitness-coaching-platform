import 'server-only'
import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { maybeAutoAssignCoach } from '@/lib/coach-assignment'
import { getCoachingPlan, type CoachingPlanSlug } from '@/lib/payments/plans'
import { findAuthUserIdByEmail } from '@/lib/payments/auth-user'
import { isEmailConfigured, sendDirectEmail } from '@/lib/notifications/email-provider'
import { resolveAuthEmailRedirectOrigin } from '@/lib/admin/portal-urls'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RedemptionCode } from '@/types/database'

export type ValidateCodeResult = {
  valid: boolean
  error?: string
  code?: Pick<
    RedemptionCode,
    'id' | 'code' | 'plan_slug' | 'duration_months' | 'membership_expires_at' | 'member_label'
  >
  planName?: string
  membershipExpiresAt?: string | null
}

export function normalizeRedemptionCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

function enrollmentSigningSecret(): string {
  return (
    process.env.ENROLLMENT_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'enrollment-dev-secret'
  )
}

type EnrollTokenPayload = {
  v: 1
  codeId: string
  email: string
  name: string
  exp: number
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export function signEnrollmentToken(payload: Omit<EnrollTokenPayload, 'v'>): string {
  const body: EnrollTokenPayload = { v: 1, ...payload }
  const data = b64url(JSON.stringify(body))
  const sig = createHmac('sha256', enrollmentSigningSecret()).update(data).digest()
  return `${data}.${b64url(sig)}`
}

export function verifyEnrollmentToken(token: string): EnrollTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [data, sig] = parts
  if (!data || !sig) return null
  const expected = createHmac('sha256', enrollmentSigningSecret()).update(data).digest()
  let provided: Buffer
  try {
    provided = fromB64url(sig)
  } catch {
    return null
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null
  try {
    const parsed = JSON.parse(fromB64url(data).toString('utf8')) as EnrollTokenPayload
    if (parsed.v !== 1 || !parsed.codeId || !parsed.email || !parsed.exp) return null
    if (parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function endOfDayUtc(dateIso: string): Date {
  const d = new Date(dateIso)
  if (!Number.isFinite(d.getTime())) return d
  // If admin passed a date-only string (YYYY-MM-DD), treat as end of that calendar day UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) {
    d.setUTCHours(23, 59, 59, 999)
  }
  return d
}

function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  return Math.max(1, months || 1)
}

export async function validateRedemptionCode(
  code: string,
  supabase?: SupabaseClient
): Promise<ValidateCodeResult> {
  const db = supabase ?? createAdminClient()
  const normalized = normalizeRedemptionCode(code)

  if (!normalized || normalized.length < 2) {
    return { valid: false, error: 'Please enter a valid enrollment code.' }
  }

  const { data, error } = await db
    .from('redemption_codes')
    .select(
      'id, code, plan_slug, duration_months, remaining_uses, expires_at, is_active, membership_expires_at, member_label'
    )
    .eq('code', normalized)
    .maybeSingle()

  if (error) return { valid: false, error: error.message }
  if (!data) return { valid: false, error: 'Invalid enrollment code.' }
  if (!data.is_active) return { valid: false, error: 'This code is no longer active.' }
  if (data.remaining_uses <= 0) return { valid: false, error: 'This code has already been used.' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, error: 'This code has expired.' }
  }

  if (data.membership_expires_at) {
    const membershipEnd = new Date(data.membership_expires_at)
    if (membershipEnd.getTime() < Date.now()) {
      return { valid: false, error: 'This membership code has already expired.' }
    }
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
      membership_expires_at: data.membership_expires_at,
      member_label: data.member_label,
    },
    planName: plan.name,
    membershipExpiresAt: data.membership_expires_at,
  }
}

function resolveMembershipExpiresAt(codeRow: {
  membership_expires_at: string | null
  duration_months: number
}): Date {
  if (codeRow.membership_expires_at) {
    return endOfDayUtc(codeRow.membership_expires_at)
  }
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + codeRow.duration_months)
  return expiresAt
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

/** Grants access for an already-authenticated or newly-created user (legacy checkout redeem). */
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

  await grantEnrollmentAccess({
    admin,
    userId,
    email,
    name,
    codeRow: codeRow as RedemptionCode,
  })

  return { userId, isNewUser, redirectTo: '/onboarding' }
}

async function grantEnrollmentAccess(input: {
  admin: SupabaseClient
  userId: string
  email: string
  name: string
  codeRow: RedemptionCode
}): Promise<void> {
  const { admin, userId, email, name, codeRow } = input
  const expiresAt = resolveMembershipExpiresAt(codeRow)
  const now = new Date().toISOString()

  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    email,
    name,
    role: 'client',
    payment_confirmed: true,
    access_source: 'enrollment_code',
    onboarding_complete: false,
    onboarding_completed_at: null,
    plan_delivered: false,
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
    razorpay_payment_id: `enroll_${codeRow.id}_${userId}_${randomBytes(4).toString('hex')}`,
    razorpay_order_id: `enroll_order_${codeRow.id}_${Date.now()}`,
    plan_slug: codeRow.plan_slug,
    plan_name: plan?.name ?? codeRow.plan_slug,
    amount_paise: 0,
    currency: 'INR',
    status: 'redeemed',
    customer_email: email,
    customer_name: name,
  })
}

export type StartEnrollmentInput = {
  code: string
  email: string
  name: string
  origin?: string | null
}

export type StartEnrollmentResult = {
  ok: true
  email: string
  membershipExpiresAt: string | null
  emailSkipped?: boolean
}

export async function startEnrollment(input: StartEnrollmentInput): Promise<StartEnrollmentResult> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address')
  if (!name || name.length < 2) throw new Error('Enter your name')

  const validation = await validateRedemptionCode(input.code, admin)
  if (!validation.valid || !validation.code) {
    throw new Error(validation.error ?? 'Invalid code')
  }

  const existingId = await findAuthUserIdByEmail(admin, email)
  if (existingId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('payment_confirmed, access_source, onboarding_complete')
      .eq('id', existingId)
      .maybeSingle()
    if (profile?.payment_confirmed && profile.access_source !== 'admin_trial') {
      throw new Error('An account with this email already has access. Please log in instead.')
    }
  }

  const token = signEnrollmentToken({
    codeId: validation.code.id,
    email,
    name,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  })

  const origin = resolveAuthEmailRedirectOrigin(input.origin)
  const link = `${origin}/enroll/set-password?token=${encodeURIComponent(token)}`

  const membershipLabel = validation.membershipExpiresAt
    ? new Date(validation.membershipExpiresAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  const subject = 'Confirm your Lurvox enrollment'
  const text = [
    `Hi ${name},`,
    '',
    'Confirm your email and set a password to finish enrolling on the Lurvox web platform.',
    membershipLabel ? `Your membership access runs until ${membershipLabel}.` : '',
    '',
    `Open this link to continue:`,
    link,
    '',
    'This link expires in 24 hours. If you did not request this, you can ignore this email.',
  ]
    .filter(Boolean)
    .join('\n')

  const html = `<p>Hi ${name},</p>
<p>Confirm your email and set a password to finish enrolling on the Lurvox web platform.</p>
${membershipLabel ? `<p>Your membership access runs until <strong>${membershipLabel}</strong>.</p>` : ''}
<p><a href="${link}">Confirm email &amp; set password</a></p>
<p style="color:#666;font-size:13px">This link expires in 24 hours.</p>`

  if (!isEmailConfigured()) {
    // Dev / misconfigured: still return ok but include skipped so UI can show the link in non-prod only via logs
    console.info('[enroll] Email not configured. Enrollment link:', link)
    const sent = await sendDirectEmail({ to: email, subject, text, html })
    return {
      ok: true,
      email,
      membershipExpiresAt: validation.membershipExpiresAt ?? null,
      emailSkipped: sent.skipped ?? true,
    }
  }

  const sent = await sendDirectEmail({ to: email, subject, text, html })
  if (!sent.ok) throw new Error(sent.error ?? 'Failed to send confirmation email')

  return {
    ok: true,
    email,
    membershipExpiresAt: validation.membershipExpiresAt ?? null,
    emailSkipped: sent.skipped,
  }
}

export type CompleteEnrollmentInput = {
  token: string
  password: string
}

export type CompleteEnrollmentResult = {
  userId: string
  email: string
  redirectTo: string
}

export async function completeEnrollment(
  input: CompleteEnrollmentInput
): Promise<CompleteEnrollmentResult> {
  const payload = verifyEnrollmentToken(input.token)
  if (!payload) throw new Error('This enrollment link is invalid or has expired. Start again from /enroll.')

  const password = input.password
  if (password.length < 6) throw new Error('Password must be at least 6 characters')

  const admin = createAdminClient()
  const { data: codeRow, error } = await admin
    .from('redemption_codes')
    .select('*')
    .eq('id', payload.codeId)
    .eq('is_active', true)
    .gt('remaining_uses', 0)
    .maybeSingle()

  if (error || !codeRow) throw new Error('This enrollment code is no longer available.')

  if (codeRow.membership_expires_at && new Date(codeRow.membership_expires_at).getTime() < Date.now()) {
    throw new Error('This membership code has already expired.')
  }
  if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) {
    throw new Error('This enrollment code has expired.')
  }

  const email = payload.email
  const name = payload.name.trim() || 'Member'

  let userId = await findAuthUserIdByEmail(admin, email)
  let isNewUser = false

  if (!userId) {
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
  } else {
    await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { name },
    })
  }

  // Avoid double-redeem if they already used this code
  const { data: existingUsage } = await admin
    .from('redemption_usages')
    .select('id')
    .eq('code_id', codeRow.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingUsage) {
    await grantEnrollmentAccess({
      admin,
      userId,
      email,
      name,
      codeRow: codeRow as RedemptionCode,
    })
  } else {
    // Ensure profile still has entitlement + pending onboarding
    const expiresAt = resolveMembershipExpiresAt(codeRow as RedemptionCode)
    await admin.from('profiles').upsert({
      id: userId,
      email,
      name,
      role: 'client',
      payment_confirmed: true,
      access_source: 'enrollment_code',
      onboarding_complete: false,
      subscription_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  void isNewUser
  return { userId, email, redirectTo: '/onboarding' }
}

export type CreateRedemptionCodeInput = {
  code: string
  planSlug: CoachingPlanSlug
  durationMonths?: number
  maxRedemptions: number
  /** Exact membership end date for the member after redeem */
  membershipExpiresAt: string
  /** Optional: when the code itself can no longer be redeemed */
  expiresAt?: string | null
  isReusable?: boolean
  notes?: string
  memberLabel?: string
  createdBy?: string
}

export async function createRedemptionCode(
  input: CreateRedemptionCodeInput,
  supabase?: SupabaseClient
): Promise<{ data: RedemptionCode | null; error: string | null }> {
  const db = supabase ?? createAdminClient()
  const normalized = normalizeRedemptionCode(input.code)
  const now = new Date().toISOString()

  if (!normalized || normalized.length < 2) {
    return { data: null, error: 'Code must be at least 2 characters' }
  }

  if (!input.membershipExpiresAt) {
    return { data: null, error: 'Membership expiry date is required' }
  }

  const membershipEnd = endOfDayUtc(input.membershipExpiresAt)
  if (!Number.isFinite(membershipEnd.getTime()) || membershipEnd.getTime() < Date.now()) {
    return { data: null, error: 'Membership expiry must be a future date' }
  }

  const durationMonths =
    input.durationMonths && input.durationMonths > 0
      ? input.durationMonths
      : monthsBetween(new Date(), membershipEnd)

  const { data, error } = await db
    .from('redemption_codes')
    .insert({
      code: normalized,
      plan_slug: input.planSlug,
      duration_months: durationMonths,
      max_redemptions: input.maxRedemptions,
      remaining_uses: input.maxRedemptions,
      expires_at: input.expiresAt ?? null,
      membership_expires_at: membershipEnd.toISOString(),
      member_label: input.memberLabel?.trim() || null,
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
