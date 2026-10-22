import type { SupabaseClient } from '@supabase/supabase-js'
import { hasClientEntitlement } from '@/lib/entitlements'
import { getCoachingPlan } from '@/lib/payments/plans'

export const EXISTING_PLAN_CALL_BLOCK_MESSAGE =
  'You already have a Lurvox plan. Sign in to the app and message your coach there.'

const STAFF_ROLES = new Set(['coach', 'admin', 'super_admin'])
const OPEN_PURCHASE_STATUSES = new Set(['captured', 'redeemed'])

export type ExistingPlanProfile = {
  id: string
  email: string | null
  phone: string | null
  role: string | null
  payment_confirmed: boolean | null
  access_source: string | null
  subscription_expires_at: string | null
}

export type ExistingPlanPurchase = {
  id: string
  user_id: string | null
  plan_slug: string | null
  status: string | null
  subscription_status: string | null
  customer_email: string | null
  customer_phone: string | null
}

/** Last 10 digits, so +91, spaces, and dashes still match the same mobile. */
export function phoneLast10(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

export function emailsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = left?.trim().toLowerCase() ?? ''
  const b = right?.trim().toLowerCase() ?? ''
  if (!a.includes('@') || !b.includes('@')) return false
  return a === b
}

export function phonesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = phoneLast10(left)
  const b = phoneLast10(right)
  return Boolean(a && b && a === b)
}

function contactsMatch(input: { phone: string; email: string | null }, rowPhone: string | null, rowEmail: string | null): boolean {
  return phonesMatch(input.phone, rowPhone) || emailsMatch(input.email, rowEmail)
}

/** Coaching, digital, trial, and older duration plans. Add-ons are not plans. */
export function isMembershipPlanSlug(slug: string | null | undefined): boolean {
  return getCoachingPlan(slug) != null
}

function isStaff(role: string | null | undefined): boolean {
  return Boolean(role && STAFF_ROLES.has(role))
}

function profileHasPlan(profile: ExistingPlanProfile, now: number): boolean {
  if (isStaff(profile.role)) return false
  return hasClientEntitlement(
    {
      payment_confirmed: profile.payment_confirmed,
      access_source: profile.access_source as 'purchase' | 'admin_trial' | 'enrollment_code' | null,
      subscription_expires_at: profile.subscription_expires_at,
    },
    now
  )
}

function purchaseIsOpenPlan(purchase: ExistingPlanPurchase): boolean {
  const status = (purchase.status || '').toLowerCase()
  if (!OPEN_PURCHASE_STATUSES.has(status)) return false
  if ((purchase.subscription_status || '').toLowerCase() === 'refunded') return false
  return isMembershipPlanSlug(purchase.plan_slug)
}

/**
 * Block a lurvox.in consultation when this phone or email already has a plan.
 * Active access of any plan type counts. A paid plan that has not been claimed yet counts.
 * An ended membership does not.
 */
export function consultationBlockedByExistingPlan(input: {
  phone: string
  email: string | null
  profiles: ExistingPlanProfile[]
  purchases: ExistingPlanPurchase[]
  linkedProfiles: ExistingPlanProfile[]
  now?: number
}): boolean {
  const now = input.now ?? Date.now()
  const profilesById = new Map<string, ExistingPlanProfile>()
  for (const profile of [...input.profiles, ...input.linkedProfiles]) {
    profilesById.set(profile.id, profile)
  }

  for (const profile of input.profiles) {
    if (!contactsMatch(input, profile.phone, profile.email)) continue
    if (profileHasPlan(profile, now)) return true
  }

  for (const purchase of input.purchases) {
    if (!contactsMatch(input, purchase.customer_phone, purchase.customer_email)) continue
    if (!purchaseIsOpenPlan(purchase)) continue
    if (!purchase.user_id) return true
    const profile = profilesById.get(purchase.user_id)
    if (!profile) return true
    if (profileHasPlan(profile, now)) return true
  }

  return false
}

function quoteOrValue(value: string): string {
  return `"${value.replace(/"/g, '')}"`
}

/** LIKE patterns that cover the phone formats stored on profiles and purchases. */
export function phoneLikePatterns(phone: string): string[] {
  const last10 = phoneLast10(phone)
  if (!last10) return []
  return [
    `%${last10}%`,
    `%${last10.slice(0, 5)} ${last10.slice(5)}%`,
    `%${last10.slice(0, 3)}-${last10.slice(3, 6)}-${last10.slice(6)}%`,
    `%${last10.slice(0, 4)}-${last10.slice(4)}%`,
  ]
}

function contactOrFilter(phoneColumn: string, emailColumn: string, phone: string, email: string | null): string | null {
  const parts = phoneLikePatterns(phone).map((pattern) => `${phoneColumn}.ilike.${quoteOrValue(pattern)}`)
  const normalizedEmail = email?.trim().toLowerCase() ?? ''
  if (normalizedEmail.includes('@')) {
    parts.push(`${emailColumn}.ilike.${quoteOrValue(normalizedEmail)}`)
  }
  return parts.length ? parts.join(',') : null
}

const PROFILE_COLUMNS =
  'id, email, phone, role, payment_confirmed, access_source, subscription_expires_at'

function asProfile(row: Record<string, unknown>): ExistingPlanProfile {
  return {
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    role: (row.role as string | null) ?? null,
    payment_confirmed: (row.payment_confirmed as boolean | null) ?? null,
    access_source: (row.access_source as string | null) ?? null,
    subscription_expires_at: (row.subscription_expires_at as string | null) ?? null,
  }
}

function asPurchase(row: Record<string, unknown>): ExistingPlanPurchase {
  return {
    id: String(row.id),
    user_id: (row.user_id as string | null) ?? null,
    plan_slug: (row.plan_slug as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    subscription_status: (row.subscription_status as string | null) ?? null,
    customer_email: (row.customer_email as string | null) ?? null,
    customer_phone: (row.customer_phone as string | null) ?? null,
  }
}

export type ExistingPlanCheck =
  | { ok: true; blocked: boolean }
  | { ok: false; error: string }

export async function existingPlanBlocksConsultation(
  admin: SupabaseClient,
  input: { phone: string; email?: string | null }
): Promise<ExistingPlanCheck> {
  const phone = input.phone.trim()
  const email = input.email?.trim().toLowerCase() || null
  if (!phoneLast10(phone)) {
    return { ok: false, error: 'A valid phone number is required.' }
  }

  const profileFilter = contactOrFilter('phone', 'email', phone, email)
  const purchaseFilter = contactOrFilter('customer_phone', 'customer_email', phone, email)
  if (!profileFilter || !purchaseFilter) {
    return { ok: false, error: 'A valid phone number is required.' }
  }

  const [profilesResult, purchasesResult] = await Promise.all([
    admin.from('profiles').select(PROFILE_COLUMNS).or(profileFilter).limit(30),
    admin
      .from('purchases')
      .select('id, user_id, plan_slug, status, subscription_status, customer_email, customer_phone')
      .or(purchaseFilter)
      .in('status', ['captured', 'redeemed'])
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  if (profilesResult.error) {
    return { ok: false, error: profilesResult.error.message }
  }
  if (purchasesResult.error) {
    return { ok: false, error: purchasesResult.error.message }
  }

  const profiles = ((profilesResult.data ?? []) as Record<string, unknown>[]).map(asProfile)
  const purchases = ((purchasesResult.data ?? []) as Record<string, unknown>[]).map(asPurchase)
  const knownIds = new Set(profiles.map((profile) => profile.id))
  const missingIds = [
    ...new Set(
      purchases
        .map((purchase) => purchase.user_id)
        .filter((id): id is string => Boolean(id) && !knownIds.has(id))
    ),
  ]

  let linkedProfiles: ExistingPlanProfile[] = []
  if (missingIds.length) {
    const linked = await admin.from('profiles').select(PROFILE_COLUMNS).in('id', missingIds)
    if (linked.error) return { ok: false, error: linked.error.message }
    linkedProfiles = ((linked.data ?? []) as Record<string, unknown>[]).map(asProfile)
  }

  return {
    ok: true,
    blocked: consultationBlockedByExistingPlan({
      phone,
      email,
      profiles,
      purchases,
      linkedProfiles,
    }),
  }
}
