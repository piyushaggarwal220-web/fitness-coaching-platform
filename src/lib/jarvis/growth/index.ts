/**
 * Phase 17 — Cross-system growth operator.
 * Reuses getPerformanceByFunnel, buildBusinessOperatorSnapshot, investigate — no duplicate math.
 */

import { getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
import { listOpportunities } from '@/lib/jarvis/opportunities/store'
import { cpaSpendScenario } from '@/lib/jarvis/opportunities/scoring'

export type FunnelStageStatus = {
  stage: string
  data_status: 'observed' | 'unavailable' | 'unsupported'
  note: string
  value: number | null
}

export async function growthSnapshot(opts?: { days?: number }): Promise<Record<string, unknown>> {
  const days = opts?.days ?? 7
  const [perf, revenue] = await Promise.all([
    getPerformanceByFunnel({ days }),
    loadLurvoxRevenue({ days: 7 }).catch(() => null),
  ])

  const byFunnel = perf.byFunnel.map((f) => ({
    funnel_id: f.funnel_id ?? 'UNCLASSIFIED',
    funnel_name: f.funnel_name,
    spend: f.spend,
    purchases: f.purchases,
    revenue: f.revenue,
    cpa: f.cpa,
    initial_roas: f.initial_roas,
    data_note: f.funnel_id ? 'classified' : 'UNCLASSIFIED — do not infer funnel',
  }))

  return {
    ok: true,
    window_days: days,
    timezone: 'Asia/Kolkata',
    funnels: byFunnel,
    unclassified_spend: perf.unclassified?.spend ?? null,
    lurvox_revenue: revenue
      ? {
          gross_inr: revenue.gross_inr,
          data_status: revenue.data_status,
          note: 'LURVOX purchases — not Shopify, not Meta attribution.',
        }
      : { data_status: 'unavailable' },
    limitations: [
      'Landing/checkout stage metrics may be UNAVAILABLE.',
      'Shopify store commerce is separate from LURVOX product revenue.',
      'Never blend ₹99 and ₹1,699 funnel economics.',
    ],
    label: 'OBSERVED snapshot — not a forecast',
  }
}

export async function growthFunnelAnalysis(funnelId: string | null): Promise<Record<string, unknown>> {
  if (!funnelId) {
    return {
      ok: false,
      funnel_id: 'UNCLASSIFIED',
      error: 'funnel_id required — never infer from price',
    }
  }
  const perf = await getPerformanceByFunnel({ days: 14 })
  const f = perf.byFunnel.find((x) => x.funnel_id === funnelId)
  if (!f) {
    return { ok: false, error: 'funnel_not_found_or_no_rows', funnel_id: funnelId }
  }

  const stages: FunnelStageStatus[] = [
    {
      stage: 'Traffic/Spend',
      data_status: 'observed',
      value: f.spend,
      note: 'Meta marketing_performance spend',
    },
    {
      stage: 'Click',
      data_status: f.clicks != null ? 'observed' : 'unavailable',
      value: f.clicks ?? null,
      note: f.clicks != null ? 'Observed clicks' : 'Click data UNAVAILABLE',
    },
    {
      stage: 'Landing',
      data_status: 'unsupported',
      value: null,
      note: 'Landing analytics not wired as SOT — UNSUPPORTED',
    },
    {
      stage: 'Checkout',
      data_status: 'unsupported',
      value: null,
      note: 'Checkout drop-off not available as SOT — UNSUPPORTED',
    },
    {
      stage: 'Purchase (ad-attributed)',
      data_status: 'observed',
      value: f.purchases,
      note: 'Meta attributed purchases — not LURVOX ledger',
    },
    {
      stage: 'Revenue (ad-attributed)',
      data_status: 'observed',
      value: f.revenue,
      note: 'Attributed revenue from performance rows',
    },
  ]

  return {
    ok: true,
    funnel_id: funnelId,
    funnel_name: f.funnel_name,
    cpa: f.cpa,
    initial_roas: f.initial_roas,
    stages,
    bottlenecks: stages
      .filter((s) => s.data_status !== 'observed')
      .map((s) => `${s.stage}: ${s.data_status.toUpperCase()}`),
  }
}

export async function growthBottlenecks(): Promise<Record<string, unknown>> {
  const perf = await getPerformanceByFunnel({ days: 7 })
  const bottlenecks: { funnel_id: string; kind: string; observed: string; inference: string }[] = []

  for (const f of perf.byFunnel) {
    if (!f.funnel_id) continue
    if (f.cpa != null && f.target_cpa != null && f.cpa > f.target_cpa * 1.25 && f.spend >= 500) {
      bottlenecks.push({
        funnel_id: f.funnel_id,
        kind: 'acquisition_efficiency',
        observed: `CPA ₹${Math.round(f.cpa)} > target ₹${f.target_cpa}`,
        inference: 'Possible creative/audience/conversion constraint — causality not established.',
      })
    }
    if (f.spend >= 1000 && (f.purchases == null || f.purchases === 0)) {
      bottlenecks.push({
        funnel_id: f.funnel_id,
        kind: 'zero_attributed_purchases',
        observed: `Spend ₹${Math.round(f.spend)} with 0 attributed purchases in window.`,
        inference: 'May be tracking lag, creative misfit, or offer friction — unproven.',
      })
    }
  }

  if (perf.unclassified?.spend && perf.unclassified.spend >= 300) {
    bottlenecks.push({
      funnel_id: 'UNCLASSIFIED',
      kind: 'mapping_gap',
      observed: `Unclassified spend ₹${Math.round(perf.unclassified.spend)}`,
      inference: 'Funnel mapping incomplete.',
    })
  }

  return { ok: true, bottlenecks, note: 'Bottlenecks are OBSERVED/INFERRED — not guaranteed root causes.' }
}

export async function growthOpportunities(): Promise<Record<string, unknown>> {
  const opps = await listOpportunities({
    status: ['DETECTED', 'SCORED', 'VALIDATED', 'PROPOSED'],
    limit: 15,
  })
  return {
    ok: true,
    opportunities: opps.map((o) => ({
      id: o.id,
      title: o.title,
      type: o.type,
      funnel_id: o.funnel_id ?? 'UNCLASSIFIED',
      priority: o.priority,
      recommendation: o.recommendations[0] ?? null,
    })),
  }
}

export async function growthInvestigate(question: string): Promise<Record<string, unknown>> {
  const { runInvestigationPattern } = await import('@/lib/jarvis/operator/investigations/patterns')
  const result = await runInvestigationPattern({
    question: question.slice(0, 400),
  })
  return {
    ok: true,
    investigation: result,
    note: 'Uses existing investigation patterns. Coordinated proposals are plans only — Phase 12 gates execution.',
  }
}

export function growthScenario(input: {
  spend_inr: number | null
  cpa_inr: number | null
  cpa_change_pct: number
}) {
  return {
    ...cpaSpendScenario(input),
    coordinated_proposal_example: [
      '1. Investigate creative fatigue (READ).',
      '2. Generate creative concepts (LOW_RISK / approval as configured).',
      '3. Design experiment via experiments.* (approval for significant spend).',
      '4. Measure → learn via Phase 3/14 gates.',
      'No step auto-executes significant Meta/IG writes.',
    ],
  }
}

export async function growthHealth(): Promise<Record<string, unknown>> {
  const snap = await growthSnapshot({ days: 7 })
  const bottlenecks = await growthBottlenecks()
  return {
    ok: true,
    funnel_count: Array.isArray((snap as { funnels?: unknown[] }).funnels)
      ? (snap as { funnels: unknown[] }).funnels.length
      : 0,
    bottleneck_count: Array.isArray((bottlenecks as { bottlenecks?: unknown[] }).bottlenecks)
      ? (bottlenecks as { bottlenecks: unknown[] }).bottlenecks.length
      : 0,
    note: 'Phase 17 growth health — calculation-first, no invented stages.',
  }
}
