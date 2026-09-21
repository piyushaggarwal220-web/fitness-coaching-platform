/**
 * Rule-based creative performance classification.
 * LLM may add reasoning; it does NOT alone determine financial actions.
 * Thresholds come from marketing_funnels (DB), never hard-coded globals.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getFunnelById } from '@/lib/ai-marketing/funnels'
import { aggregatePerformance } from '@/lib/ai-marketing/metrics'
import { getGuardrails } from '@/lib/ai-marketing/settings'
import type { MarketingFunnel } from '@/lib/ai-marketing/types'

export type CreativeClass =
  | 'INSUFFICIENT_DATA'
  | 'TESTING'
  | 'PROMISING'
  | 'WINNER'
  | 'DECLINING'
  | 'FATIGUED'
  | 'LOSER'

export type CreativePerformanceRow = {
  creative_id: string
  funnel_id: string | null
  name: string
  spend: number
  purchases: number
  revenue: number
  impressions: number
  clicks: number
  cpa: number | null
  roas: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  frequency_max: number
  creative_age_days: number
  classification: CreativeClass
  reasons: string[]
}

export function classifyCreative(input: {
  funnel: MarketingFunnel
  spend: number
  purchases: number
  revenue: number
  cpa: number | null
  roas: number | null
  ctr: number | null
  frequency_max: number
  creative_age_days: number
  recent_roas?: number | null
  prior_roas?: number | null
  accountFatigueThreshold: number
}): { classification: CreativeClass; reasons: string[] } {
  const reasons: string[] = []
  const { funnel } = input

  if (input.spend < funnel.min_spend_before_pause) {
    reasons.push(
      `Spend ${input.spend} < funnel min_spend_before_pause ${funnel.min_spend_before_pause}`
    )
    return { classification: 'INSUFFICIENT_DATA', reasons }
  }

  if (input.frequency_max >= input.accountFatigueThreshold) {
    reasons.push(
      `Frequency ${input.frequency_max} >= fatigue threshold ${input.accountFatigueThreshold}`
    )
  }

  const isWinner =
    input.purchases >= funnel.min_purchases_for_winner &&
    input.cpa != null &&
    input.cpa <= funnel.target_cpa &&
    input.roas != null &&
    input.roas >= funnel.target_roas

  if (isWinner) {
    reasons.push(
      `Purchases ${input.purchases} >= ${funnel.min_purchases_for_winner}; CPA ${input.cpa} <= target ${funnel.target_cpa}; ROAS ${input.roas} >= ${funnel.target_roas}`
    )
    if (input.frequency_max >= input.accountFatigueThreshold) {
      return { classification: 'FATIGUED', reasons }
    }
    if (
      input.prior_roas != null &&
      input.recent_roas != null &&
      input.prior_roas > 0 &&
      input.recent_roas < input.prior_roas * 0.7
    ) {
      reasons.push(
        `Recent ROAS ${input.recent_roas} declined vs prior ${input.prior_roas}`
      )
      return { classification: 'DECLINING', reasons }
    }
    return { classification: 'WINNER', reasons }
  }

  if (
    input.cpa != null &&
    input.cpa > funnel.max_acceptable_cpa &&
    input.spend >= funnel.min_spend_before_pause
  ) {
    reasons.push(
      `CPA ${input.cpa} > max_acceptable_cpa ${funnel.max_acceptable_cpa} with sufficient spend`
    )
    return { classification: 'LOSER', reasons }
  }

  if (
    input.purchases >= 1 &&
    input.cpa != null &&
    input.cpa <= funnel.max_acceptable_cpa &&
    (input.roas == null || input.roas >= funnel.min_roas)
  ) {
    reasons.push('Showing early efficiency within max CPA / min ROAS band')
    return { classification: 'PROMISING', reasons }
  }

  if (input.creative_age_days <= funnel.min_data_window_days + 2) {
    reasons.push('Still inside early test window')
    return { classification: 'TESTING', reasons }
  }

  if (input.frequency_max >= input.accountFatigueThreshold) {
    return { classification: 'FATIGUED', reasons }
  }

  reasons.push('Past early window without clear win/loss')
  return { classification: 'TESTING', reasons }
}

export async function refreshCreativePerformanceForFunnel(
  funnelId: string,
  days = 30
): Promise<CreativePerformanceRow[]> {
  const funnel = await getFunnelById(funnelId)
  if (!funnel) return []

  const admin = createAdminClient()
  const account = await getGuardrails()
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceDate = since.toISOString().slice(0, 10)
  const mid = new Date()
  mid.setDate(mid.getDate() - Math.floor(days / 2))
  const midDate = mid.toISOString().slice(0, 10)

  const { data: creatives } = await admin
    .from('marketing_creatives')
    .select('id, name, created_at, funnel_id, metadata')
    .eq('funnel_id', funnelId)

  const rows: CreativePerformanceRow[] = []

  for (const c of creatives ?? []) {
    const { data: perf } = await admin
      .from('marketing_performance')
      .select('*')
      .eq('creative_id', c.id)
      .gte('date', sinceDate)

    const totals = aggregatePerformance(
      (perf ?? []).map((p) => ({
        spend: Number(p.spend) || 0,
        impressions: Number(p.impressions) || 0,
        reach: Number(p.reach) || 0,
        clicks: Number(p.clicks) || 0,
        purchases: Number(p.purchases) || 0,
        revenue: Number(p.revenue) || 0,
      }))
    )

    const recent = aggregatePerformance(
      (perf ?? [])
        .filter((p) => String(p.date) >= midDate)
        .map((p) => ({
          spend: Number(p.spend) || 0,
          impressions: Number(p.impressions) || 0,
          reach: Number(p.reach) || 0,
          clicks: Number(p.clicks) || 0,
          purchases: Number(p.purchases) || 0,
          revenue: Number(p.revenue) || 0,
        }))
    )
    const prior = aggregatePerformance(
      (perf ?? [])
        .filter((p) => String(p.date) < midDate)
        .map((p) => ({
          spend: Number(p.spend) || 0,
          impressions: Number(p.impressions) || 0,
          reach: Number(p.reach) || 0,
          clicks: Number(p.clicks) || 0,
          purchases: Number(p.purchases) || 0,
          revenue: Number(p.revenue) || 0,
        }))
    )

    const frequencyMax = Math.max(
      0,
      ...(perf ?? []).map((p) => Number(p.frequency) || 0)
    )
    const ageDays = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )
    )

    const { classification, reasons } = classifyCreative({
      funnel,
      spend: totals.spend,
      purchases: totals.purchases,
      revenue: totals.revenue,
      cpa: totals.cpa,
      roas: totals.roas,
      ctr: totals.ctr,
      frequency_max: frequencyMax,
      creative_age_days: ageDays,
      recent_roas: recent.roas,
      prior_roas: prior.roas,
      accountFatigueThreshold: account.CREATIVE_FATIGUE_THRESHOLD,
    })

    const row: CreativePerformanceRow = {
      creative_id: c.id,
      funnel_id: funnelId,
      name: c.name,
      spend: totals.spend,
      purchases: totals.purchases,
      revenue: totals.revenue,
      impressions: totals.impressions,
      clicks: totals.clicks,
      cpa: totals.cpa,
      roas: totals.roas,
      ctr: totals.ctr,
      cpc: totals.cpc,
      cpm: totals.cpm,
      frequency_max: frequencyMax,
      creative_age_days: ageDays,
      classification,
      reasons,
    }
    rows.push(row)

    const priorMeta =
      typeof c.metadata === 'object' && c.metadata ? (c.metadata as object) : {}

    await admin
      .from('marketing_creatives')
      .update({
        performance_status: classification,
        metadata: {
          ...priorMeta,
          performance: {
            ...row,
            refreshed_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id)
  }

  return rows.sort((a, b) => b.spend - a.spend)
}

export async function listCreativePerformance(opts?: {
  funnelId?: string
  days?: number
}): Promise<CreativePerformanceRow[]> {
  if (opts?.funnelId) {
    return refreshCreativePerformanceForFunnel(opts.funnelId, opts.days ?? 30)
  }
  const admin = createAdminClient()
  const { data: funnels } = await admin
    .from('marketing_funnels')
    .select('id')
    .eq('status', 'active')
  const all: CreativePerformanceRow[] = []
  for (const f of funnels ?? []) {
    all.push(...(await refreshCreativePerformanceForFunnel(f.id, opts?.days ?? 30)))
  }
  return all
}
