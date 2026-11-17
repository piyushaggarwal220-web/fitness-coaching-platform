import type { SupabaseClient } from '@supabase/supabase-js'
import { getCoachingPlan, subscriptionExpiryFromPlan } from '@/lib/payments/plans'
import {
  planUpgradeFamily,
  type HeldPlanForUpgrade,
} from '@/lib/payments/plan-upgrade-pricing'

type PurchaseRow = {
  id: string
  user_id: string | null
  plan_slug: string
  plan_name: string | null
  amount_paise: number | null
  refunded_amount_paise: number | null
  status: string
  subscription_status: string | null
  created_at: string
}

export type HeldPlanSnapshot = {
  slug: string
  planName: string
  netPaidPaise: number
  startsAt: string
  accessEndsAt: string
}

export function snapshotHeldPlans(plans: readonly HeldPlanForUpgrade[]): HeldPlanSnapshot[] {
  return plans.map((plan) => ({
    slug: plan.slug,
    planName: plan.planName,
    netPaidPaise: plan.netPaidPaise,
    startsAt: plan.startsAt.toISOString(),
    accessEndsAt: plan.accessEndsAt.toISOString(),
  }))
}

export function heldPlansFromSnapshot(rows: readonly HeldPlanSnapshot[]): HeldPlanForUpgrade[] {
  return rows.map((row) => ({
    slug: row.slug,
    planName: row.planName,
    netPaidPaise: row.netPaidPaise,
    startsAt: new Date(row.startsAt),
    accessEndsAt: new Date(row.accessEndsAt),
  }))
}

/**
 * Active plans this email already holds. A lookup failure is not an empty cart:
 * callers must not turn it into a full-price charge or a ₹0 charge.
 */
export async function loadHeldPlansForUpgrade(
  admin: SupabaseClient,
  email: string,
  options?: { now?: Date; excludePurchaseId?: string }
): Promise<{ ok: true; plans: HeldPlanForUpgrade[] } | { ok: false; error: string }> {
  const now = options?.now ?? new Date()
  const normalized = email.trim().toLowerCase()
  if (!normalized.includes('@')) return { ok: true, plans: [] }

  const { data, error } = await admin
    .from('purchases')
    .select(
      'id, user_id, plan_slug, plan_name, amount_paise, refunded_amount_paise, status, subscription_status, created_at'
    )
    .eq('customer_email', normalized)
    .in('status', ['captured', 'redeemed'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return { ok: false, error: `Could not check the current plan: ${error.message}` }
  }

  const rows = ((data ?? []) as PurchaseRow[]).filter((row) => row.id !== options?.excludePurchaseId)
  const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))]
  const profileExpiry = new Map<string, Date>()

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, subscription_expires_at')
      .in('id', userIds)

    if (profileError) {
      return { ok: false, error: `Could not check membership end: ${profileError.message}` }
    }

    for (const profile of profiles ?? []) {
      const raw = (profile as { id: string; subscription_expires_at: string | null }).subscription_expires_at
      if (!raw) continue
      const ends = new Date(raw)
      if (!Number.isNaN(ends.getTime())) profileExpiry.set(profile.id, ends)
    }
  }

  const prepared: Array<HeldPlanForUpgrade & { family: NonNullable<ReturnType<typeof planUpgradeFamily>> }> = []

  for (const row of rows) {
    const family = planUpgradeFamily(row.plan_slug)
    const plan = getCoachingPlan(row.plan_slug)
    if (!family || !plan) continue
    if (row.subscription_status === 'cancelled' || row.subscription_status === 'refunded') continue

    const amount = row.amount_paise ?? 0
    const refunded = row.refunded_amount_paise ?? 0
    if (amount > 0 && refunded >= amount) continue

    const startsAt = new Date(row.created_at)
    if (Number.isNaN(startsAt.getTime())) continue

    const computed = subscriptionExpiryFromPlan(plan, startsAt)
    const profileEnd = row.user_id ? profileExpiry.get(row.user_id) ?? null : null
    const accessEndsAt = !plan.isDigital && profileEnd ? profileEnd : computed
    if (accessEndsAt.getTime() <= now.getTime()) continue

    prepared.push({
      family,
      slug: row.plan_slug,
      planName: row.plan_name?.trim() || plan.name,
      netPaidPaise: Math.max(0, amount - Math.max(0, refunded)),
      startsAt,
      accessEndsAt,
    })
  }

  const held: HeldPlanForUpgrade[] = []

  for (const family of ['coaching', 'duration'] as const) {
    const latest = prepared.find((row) => row.family === family)
    if (latest) {
      held.push(latest)
    }
  }

  for (const row of prepared) {
    if (row.family === 'digital') held.push(row)
  }

  return { ok: true, plans: held }
}

/** Switch a signed-in member onto a plan their current payment already covers. */
export async function applyCoveredPlanUpgrade(
  admin: SupabaseClient,
  input: {
    userId: string
    email: string
    name: string
    phone?: string | null
    planSlug: string
    fromSlug: string
    anchorAt: string
  }
): Promise<{ ok: true; purchaseId: string } | { ok: false; error: string }> {
  const plan = getCoachingPlan(input.planSlug)
  const anchor = new Date(input.anchorAt)
  if (!plan || Number.isNaN(anchor.getTime())) {
    return { ok: false, error: 'This upgrade could not be applied.' }
  }

  const paymentId = `upgrade_covered_${input.userId}_${input.fromSlug}_${plan.slug}`
  const { data: existing, error: existingError } = await admin
    .from('purchases')
    .select('id')
    .eq('razorpay_payment_id', paymentId)
    .maybeSingle()

  if (existingError) {
    return { ok: false, error: `Could not check the upgrade: ${existingError.message}` }
  }

  const now = new Date().toISOString()
  let purchaseId = (existing as { id: string } | null)?.id ?? null

  if (!purchaseId) {
    const { data: inserted, error: insertError } = await admin
      .from('purchases')
      .insert({
        user_id: input.userId,
        razorpay_payment_id: paymentId,
        razorpay_order_id: `upgrade_covered_order_${input.userId}_${plan.slug}`,
        plan_slug: plan.slug,
        plan_name: plan.name,
        amount_paise: 0,
        currency: 'INR',
        status: 'captured',
        customer_email: input.email.trim().toLowerCase(),
        customer_name: input.name.trim() || null,
        customer_phone: input.phone?.trim() || null,
        claimed_at: now,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      return { ok: false, error: insertError?.message ?? 'Could not switch the plan.' }
    }
    purchaseId = (inserted as { id: string }).id
  }

  const { data: profile, error: profileReadError } = await admin
    .from('profiles')
    .select('subscription_expires_at')
    .eq('id', input.userId)
    .maybeSingle()

  if (profileReadError) {
    return { ok: false, error: `Could not read membership: ${profileReadError.message}` }
  }

  const nextEnd = plan.isDigital
    ? subscriptionExpiryFromPlan(plan)
    : subscriptionExpiryFromPlan(plan, anchor)
  const existingEnd = (profile as { subscription_expires_at?: string | null } | null)?.subscription_expires_at
  const existingMs = existingEnd ? new Date(existingEnd).getTime() : 0
  const expiry = new Date(Math.max(nextEnd.getTime(), Number.isFinite(existingMs) ? existingMs : 0, Date.now()))

  const { error: profileWriteError } = await admin
    .from('profiles')
    .update({
      subscription_expires_at: expiry.toISOString(),
      payment_confirmed: true,
      updated_at: now,
    })
    .eq('id', input.userId)

  if (profileWriteError) {
    return { ok: false, error: `Could not update membership: ${profileWriteError.message}` }
  }

  return { ok: true, purchaseId }
}
