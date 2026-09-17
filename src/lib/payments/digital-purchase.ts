import type { SupabaseClient } from '@supabase/supabase-js'
import {
  digitalPlanSections,
  getDigitalPlan,
  isDigitalPlanSlug,
  type DigitalPlanSections,
} from '@/lib/payments/plans'

type PurchaseRow = {
  id: string
  plan_slug: string | null
  status: string | null
  created_at?: string | null
}

function isPaidStatus(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase()
  return s === 'paid' || s === 'captured' || s === 'completed' || !s
}

async function latestPaidPurchases(
  admin: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<PurchaseRow[]> {
  const { data, error } = await admin
    .from('purchases')
    .select('id, plan_slug, status, created_at')
    .eq('user_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data?.length) return []
  return (data as PurchaseRow[]).filter((p) => isPaidStatus(p.status))
}

/** Latest paid purchase for a client (digital or coaching). */
export async function latestPurchasePlanSlug(
  admin: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const paid = await latestPaidPurchases(admin, clientId, 5)
  return paid[0]?.plan_slug ?? null
}

export async function latestPaidPurchase(
  admin: SupabaseClient,
  clientId: string
): Promise<{ id: string; planSlug: string } | null> {
  const paid = await latestPaidPurchases(admin, clientId, 5)
  const row = paid.find((p) => Boolean(p.plan_slug))
  if (!row?.plan_slug) return null
  return { id: row.id, planSlug: row.plan_slug }
}

/** Latest paid Instant / digital purchase (ignores coaching rows). */
export async function latestDigitalPurchase(
  admin: SupabaseClient,
  clientId: string
): Promise<{ id: string; planSlug: string } | null> {
  const paid = await latestPaidPurchases(admin, clientId, 15)
  const row = paid.find((p) => isDigitalPlanSlug(p.plan_slug))
  if (!row?.plan_slug) return null
  return { id: row.id, planSlug: row.plan_slug }
}

/** Latest paid coaching purchase (ignores Instant digital rows). */
export async function latestCoachingPurchase(
  admin: SupabaseClient,
  clientId: string
): Promise<{ id: string; planSlug: string } | null> {
  const paid = await latestPaidPurchases(admin, clientId, 15)
  const row = paid.find((p) => p.plan_slug && !isDigitalPlanSlug(p.plan_slug))
  if (!row?.plan_slug) return null
  return { id: row.id, planSlug: row.plan_slug }
}

export async function clientLatestDigitalSections(
  admin: SupabaseClient,
  clientId: string
): Promise<DigitalPlanSections | null> {
  const digital = await latestDigitalPurchase(admin, clientId)
  if (!digital) return null
  return digitalPlanSections(digital.planSlug)
}

export async function clientHasDigitalPurchase(
  admin: SupabaseClient,
  clientId: string
): Promise<boolean> {
  return Boolean(await latestDigitalPurchase(admin, clientId))
}

export function planIsDigitalProduct(planSlug: string | null | undefined): boolean {
  return isDigitalPlanSlug(planSlug)
}

export function digitalProductDisplayName(planSlug: string | null | undefined): string {
  return getDigitalPlan(planSlug)?.name ?? 'Customised Plan'
}
