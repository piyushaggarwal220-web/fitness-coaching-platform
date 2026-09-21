import { createAdminClient } from '@/lib/supabase/admin'
import {
  aggregatePerformance,
  calcCpa,
  calcRoas,
  safeDivide,
} from '@/lib/ai-marketing/metrics'
import type {
  FunnelPerformanceSummary,
  MarketingFunnel,
} from '@/lib/ai-marketing/types'

function mapFunnel(row: Record<string, unknown>): MarketingFunnel {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    offer: String(row.offer),
    product: String(row.product),
    price_inr: Number(row.price_inr),
    estimated_fulfillment_cost_inr: Number(row.estimated_fulfillment_cost_inr) || 0,
    contribution_margin_inr:
      row.contribution_margin_inr == null ? null : Number(row.contribution_margin_inr),
    aov_inr: row.aov_inr == null ? null : Number(row.aov_inr),
    target_cpa: Number(row.target_cpa),
    max_acceptable_cpa: Number(row.max_acceptable_cpa),
    target_roas: Number(row.target_roas),
    min_roas: Number(row.min_roas),
    daily_budget_inr: row.daily_budget_inr == null ? null : Number(row.daily_budget_inr),
    test_budget_inr: row.test_budget_inr == null ? null : Number(row.test_budget_inr),
    max_daily_budget_inr:
      row.max_daily_budget_inr == null ? null : Number(row.max_daily_budget_inr),
    max_budget_increase_percent: Number(row.max_budget_increase_percent) || 20,
    max_budget_decrease_percent: Number(row.max_budget_decrease_percent) || 50,
    min_spend_before_pause: Number(row.min_spend_before_pause) || 500,
    min_purchases_for_winner: Number(row.min_purchases_for_winner) || 3,
    min_data_window_days: Number(row.min_data_window_days) || 3,
    conversion_event: String(row.conversion_event || 'purchase'),
    landing_page: row.landing_page == null ? null : String(row.landing_page),
    checkout_url: row.checkout_url == null ? null : String(row.checkout_url),
    target_audience: row.target_audience == null ? null : String(row.target_audience),
    tracks_downstream_upsell: Boolean(row.tracks_downstream_upsell),
    downstream_funnel_id:
      row.downstream_funnel_id == null ? null : String(row.downstream_funnel_id),
    notes: row.notes == null ? null : String(row.notes),
    status: (row.status as MarketingFunnel['status']) || 'active',
    metadata: (row.metadata as Record<string, unknown>) || {},
  }
}

export async function listFunnels(opts?: {
  includeArchived?: boolean
}): Promise<MarketingFunnel[]> {
  const admin = createAdminClient()
  let q = admin.from('marketing_funnels').select('*').order('price_inr', { ascending: true })
  if (!opts?.includeArchived) q = q.neq('status', 'archived')
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapFunnel(r as Record<string, unknown>))
}

export async function getFunnelById(id: string): Promise<MarketingFunnel | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_funnels')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapFunnel(data as Record<string, unknown>) : null
}

export async function getFunnelBySlug(slug: string): Promise<MarketingFunnel | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_funnels')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapFunnel(data as Record<string, unknown>) : null
}

export async function updateFunnel(
  id: string,
  patch: Partial<MarketingFunnel>
): Promise<MarketingFunnel> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_funnels')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error || !data) throw new Error(error?.message || 'Funnel update failed')
  return mapFunnel(data as Record<string, unknown>)
}

export async function createFunnel(
  input: Omit<MarketingFunnel, 'id' | 'metadata'> & { metadata?: Record<string, unknown> }
): Promise<MarketingFunnel> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_funnels')
    .insert({
      slug: input.slug,
      name: input.name,
      offer: input.offer,
      product: input.product,
      price_inr: input.price_inr,
      estimated_fulfillment_cost_inr: input.estimated_fulfillment_cost_inr,
      contribution_margin_inr: input.contribution_margin_inr,
      aov_inr: input.aov_inr,
      target_cpa: input.target_cpa,
      max_acceptable_cpa: input.max_acceptable_cpa,
      target_roas: input.target_roas,
      min_roas: input.min_roas,
      daily_budget_inr: input.daily_budget_inr,
      test_budget_inr: input.test_budget_inr,
      max_daily_budget_inr: input.max_daily_budget_inr,
      max_budget_increase_percent: input.max_budget_increase_percent,
      max_budget_decrease_percent: input.max_budget_decrease_percent,
      min_spend_before_pause: input.min_spend_before_pause,
      min_purchases_for_winner: input.min_purchases_for_winner,
      min_data_window_days: input.min_data_window_days,
      conversion_event: input.conversion_event,
      landing_page: input.landing_page,
      checkout_url: input.checkout_url,
      target_audience: input.target_audience,
      tracks_downstream_upsell: input.tracks_downstream_upsell,
      downstream_funnel_id: input.downstream_funnel_id,
      notes: input.notes,
      status: input.status,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .maybeSingle()
  if (error || !data) throw new Error(error?.message || 'Funnel create failed')
  return mapFunnel(data as Record<string, unknown>)
}

/**
 * Assign a Meta campaign (and optionally cascade to ad sets/ads) to a funnel.
 * funnelId null => UNCLASSIFIED. Never guess.
 */
export async function assignCampaignToFunnel(params: {
  campaignId: string
  funnelId: string | null
  cascade?: boolean
  actorId?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('marketing_campaigns')
    .update({
      funnel_id: params.funnelId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.campaignId)
  if (error) throw new Error(error.message)

  if (params.cascade !== false) {
    await admin
      .from('marketing_adsets')
      .update({ funnel_id: params.funnelId, updated_at: new Date().toISOString() })
      .eq('campaign_id', params.campaignId)

    const { data: adsets } = await admin
      .from('marketing_adsets')
      .select('id')
      .eq('campaign_id', params.campaignId)
    const adsetIds = (adsets ?? []).map((a) => a.id)
    if (adsetIds.length) {
      await admin
        .from('marketing_ads')
        .update({ funnel_id: params.funnelId, updated_at: new Date().toISOString() })
        .in('adset_id', adsetIds)
    }

    // Backfill performance rows for this campaign
    await admin
      .from('marketing_performance')
      .update({ funnel_id: params.funnelId })
      .eq('campaign_id', params.campaignId)
  }
}

export async function assignCreativeToFunnel(params: {
  creativeId: string
  funnelId: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('marketing_creatives')
    .update({
      funnel_id: params.funnelId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.creativeId)
  if (error) throw new Error(error.message)
}

/** Effective pause threshold for a funnel (or account default). */
export function funnelMinSpendBeforePause(
  funnel: MarketingFunnel | null,
  accountMin: number
): number {
  return funnel?.min_spend_before_pause ?? accountMin
}

export function summarizeFunnelPerformance(
  funnel: MarketingFunnel | null,
  rows: {
    spend: number
    impressions: number
    reach?: number
    clicks: number
    purchases: number
    revenue: number
  }[],
  downstreamRevenue = 0
): FunnelPerformanceSummary {
  const totals = aggregatePerformance(
    rows.map((r) => ({
      spend: r.spend,
      impressions: r.impressions,
      reach: r.reach ?? 0,
      clicks: r.clicks,
      purchases: r.purchases,
      revenue: r.revenue,
    }))
  )

  const initialRoas = calcRoas(totals.revenue, totals.spend)
  const blendedRevenue = totals.revenue + downstreamRevenue
  const blendedRoas = calcRoas(blendedRevenue, totals.spend)
  const blendedCustomerValue = safeDivide(blendedRevenue, totals.purchases)
  const aov =
    funnel?.aov_inr ??
    funnel?.price_inr ??
    safeDivide(totals.revenue, totals.purchases)

  return {
    funnel_id: funnel?.id ?? null,
    funnel_slug: funnel?.slug ?? null,
    funnel_name: funnel?.name ?? 'UNCLASSIFIED',
    classified: Boolean(funnel),
    spend: totals.spend,
    revenue: totals.revenue,
    purchases: totals.purchases,
    impressions: totals.impressions,
    clicks: totals.clicks,
    ctr: totals.ctr,
    cpc: totals.cpc,
    cpm: totals.cpm,
    cpa: calcCpa(totals.spend, totals.purchases),
    initial_roas: initialRoas,
    conversion_rate: totals.conversion_rate,
    aov,
    contribution_margin_inr: funnel?.contribution_margin_inr ?? null,
    downstream_revenue: downstreamRevenue,
    blended_customer_value: blendedCustomerValue,
    blended_roas: blendedRoas,
    target_cpa: funnel?.target_cpa ?? null,
    max_acceptable_cpa: funnel?.max_acceptable_cpa ?? null,
    target_roas: funnel?.target_roas ?? null,
    min_roas: funnel?.min_roas ?? null,
    price_inr: funnel?.price_inr ?? null,
  }
}

export async function getPerformanceByFunnel(opts?: {
  days?: number
}): Promise<{
  byFunnel: FunnelPerformanceSummary[]
  unclassified: FunnelPerformanceSummary
  blended: FunnelPerformanceSummary
  funnels: MarketingFunnel[]
}> {
  const admin = createAdminClient()
  const funnels = await listFunnels()
  const days = opts?.days ?? 30
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceDate = since.toISOString().slice(0, 10)

  const { data: perf, error } = await admin
    .from('marketing_performance')
    .select('*')
    .gte('date', sinceDate)
  if (error) throw new Error(error.message)

  const rows = perf ?? []
  const byFunnel: FunnelPerformanceSummary[] = []

  for (const funnel of funnels) {
    const funnelRows = rows.filter((r) => r.funnel_id === funnel.id)
    // Downstream revenue: performance attributed to linked higher-ticket funnel
    // from the same window is NOT mixed into initial ROAS — tracked separately.
    let downstreamRevenue = 0
    if (funnel.tracks_downstream_upsell && funnel.downstream_funnel_id) {
      // Placeholder: without purchase-level attribution, leave 0 until wired.
      // Structure is ready for joining purchase cohorts later.
      downstreamRevenue = 0
    }
    byFunnel.push(summarizeFunnelPerformance(funnel, funnelRows, downstreamRevenue))
  }

  const unclassifiedRows = rows.filter((r) => !r.funnel_id)
  const unclassified = summarizeFunnelPerformance(null, unclassifiedRows, 0)

  const all = summarizeFunnelPerformance(null, rows, 0)
  const blended: FunnelPerformanceSummary = {
    ...all,
    funnel_name: 'BUSINESS TOTAL',
    funnel_slug: 'blended',
    classified: true,
  }

  return { byFunnel, unclassified, blended, funnels }
}
