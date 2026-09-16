import type { SupabaseClient } from '@supabase/supabase-js'
import {
  digitalPlanSections,
  getDigitalPlan,
  isDigitalPlanSlug,
  type DigitalPlanSections,
} from '@/lib/payments/plans'

/** Latest paid purchase for a client (digital or coaching). */
export async function latestPurchasePlanSlug(
  admin: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const { data } = await admin
    .from('purchases')
    .select('plan_slug, status')
    .eq('user_id', clientId)
    .order('created_at', { ascending: false })
    .limit(5)

  const row = (data ?? []).find((p) => {
    const status = (p.status || '').toLowerCase()
    return status === 'paid' || status === 'captured' || status === 'completed' || !status
  })
  return row?.plan_slug ?? data?.[0]?.plan_slug ?? null
}

export async function clientLatestDigitalSections(
  admin: SupabaseClient,
  clientId: string
): Promise<DigitalPlanSections | null> {
  const slug = await latestPurchasePlanSlug(admin, clientId)
  if (!isDigitalPlanSlug(slug)) return null
  return digitalPlanSections(slug)
}

export async function clientHasDigitalPurchase(
  admin: SupabaseClient,
  clientId: string
): Promise<boolean> {
  const slug = await latestPurchasePlanSlug(admin, clientId)
  return isDigitalPlanSlug(slug)
}

export function planIsDigitalProduct(planSlug: string | null | undefined): boolean {
  return isDigitalPlanSlug(planSlug)
}

export function digitalProductDisplayName(planSlug: string | null | undefined): string {
  return getDigitalPlan(planSlug)?.name ?? 'Customised Plan'
}
