/**
 * Phase 19 — Financial intelligence (calculation-first).
 * Reuses lurvox-revenue + getPerformanceByFunnel. Never invents margin/LTV.
 */

import { getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
import { BUSINESS_TIMEZONE } from '@/lib/time/business-calendar'
import { cpaSpendScenario } from '@/lib/jarvis/opportunities/scoring'

export async function financeSnapshot(opts?: { days?: number }): Promise<Record<string, unknown>> {
  const days = opts?.days ?? 7
  const [perf, lurvox] = await Promise.all([
    getPerformanceByFunnel({ days }),
    loadLurvoxRevenue({ days }),
  ])

  const funnels = perf.byFunnel.map((f) => ({
    funnel_id: f.funnel_id ?? 'UNCLASSIFIED',
    funnel_name: f.funnel_name,
    spend_inr: f.spend,
    attributed_revenue_inr: f.revenue,
    purchases: f.purchases,
    cpa: f.cpa,
    initial_roas: f.initial_roas,
    contribution_margin_inr:
      f.contribution_margin_inr != null ? f.contribution_margin_inr : 'COST DATA UNAVAILABLE',
    note: f.funnel_id ? null : 'UNCLASSIFIED — not merged into another funnel',
  }))

  return {
    ok: true,
    timezone: BUSINESS_TIMEZONE,
    window_days: days,
    lurvox_product_revenue: {
      gross_inr: lurvox.ok ? lurvox.gross_inr : null,
      net_inr: lurvox.ok ? lurvox.net_inr : null,
      data_status: lurvox.data_status,
      source: 'public.purchases',
      note: 'Not Shopify. Not Meta attributed revenue.',
    },
    meta_by_funnel: funnels,
    unclassified_spend: perf.unclassified?.spend ?? null,
    ltv: 'LTV NOT YET MEASURED',
    missing: [
      fMissing(funnels),
      'Do not double-count LURVOX ledger with Meta attributed revenue.',
    ].filter(Boolean),
    label: 'OBSERVED financial snapshot',
  }
}

function fMissing(funnels: { contribution_margin_inr: unknown }[]): string | null {
  if (funnels.some((f) => f.contribution_margin_inr === 'COST DATA UNAVAILABLE')) {
    return 'Some funnels: COST DATA UNAVAILABLE for contribution.'
  }
  return null
}

export async function financeFunnel(funnelId: string | null): Promise<Record<string, unknown>> {
  if (!funnelId) {
    return { ok: false, error: 'funnel_id required', funnel_id: 'UNCLASSIFIED' }
  }
  const perf = await getPerformanceByFunnel({ days: 30 })
  const f = perf.byFunnel.find((x) => x.funnel_id === funnelId)
  if (!f) return { ok: false, error: 'no_data', funnel_id: funnelId }

  return {
    ok: true,
    funnel_id: funnelId,
    spend_inr: f.spend,
    purchases: f.purchases,
    attributed_revenue_inr: f.revenue,
    cpa: f.cpa,
    initial_roas: f.initial_roas,
    contribution_estimate:
      f.contribution_margin_inr != null
        ? { per_purchase_inr: f.contribution_margin_inr, status: 'configured' }
        : { status: 'COST DATA UNAVAILABLE' },
    ltv: 'LTV NOT YET MEASURED',
  }
}

export async function financeUnitEconomics(funnelId: string | null): Promise<Record<string, unknown>> {
  const base = await financeFunnel(funnelId)
  if (!(base as { ok?: boolean }).ok) return base
  return {
    ...base,
    unit_economics: {
      cpa: (base as { cpa?: number | null }).cpa ?? null,
      contribution:
        (base as { contribution_estimate?: { status: string } }).contribution_estimate,
      note: 'Unit economics from configured funnel fields + performance — no invented LTV.',
    },
  }
}

export function financeScenario(input: {
  spend_inr: number | null
  cpa_inr: number | null
  spend_change_pct?: number
  cpa_change_pct?: number
}): Record<string, unknown> {
  const spend =
    input.spend_inr != null && input.spend_change_pct != null
      ? input.spend_inr * (1 + input.spend_change_pct / 100)
      : input.spend_inr
  const cpaChange = input.cpa_change_pct ?? 0
  const scenario = cpaSpendScenario({
    spend_inr: spend,
    cpa_inr: input.cpa_inr,
    cpa_change_pct: cpaChange,
  })
  return {
    ...scenario,
    spend_input: spend,
    note: 'Mathematical SCENARIO only. Not a prediction. Auction dynamics ignored.',
  }
}

export async function financeTrends(opts?: { days?: number }): Promise<Record<string, unknown>> {
  const days = opts?.days ?? 14
  const [short, long] = await Promise.all([
    getPerformanceByFunnel({ days: Math.min(days, 7) }),
    getPerformanceByFunnel({ days }),
  ])
  return {
    ok: true,
    compare: {
      short_window_days: Math.min(days, 7),
      long_window_days: days,
      funnels: long.byFunnel
        .filter((f) => f.funnel_id)
        .map((f) => {
          const s = short.byFunnel.find((x) => x.funnel_id === f.funnel_id)
          return {
            funnel_id: f.funnel_id,
            cpa_long: f.cpa,
            cpa_short: s?.cpa ?? null,
            spend_long: f.spend,
            spend_short: s?.spend ?? null,
            change_note:
              f.cpa != null && s?.cpa != null
                ? s.cpa > f.cpa * 1.1
                  ? 'OBSERVED: short-window CPA higher than longer window'
                  : s.cpa < f.cpa * 0.9
                    ? 'OBSERVED: short-window CPA lower than longer window'
                    : 'OBSERVED: CPA roughly stable across windows'
                : 'CPA UNAVAILABLE for comparison',
          }
        }),
    },
    timezone: BUSINESS_TIMEZONE,
  }
}

export async function financeAnomalies(): Promise<Record<string, unknown>> {
  const trends = await financeTrends({ days: 14 })
  const compare = (trends as { compare?: { funnels?: { change_note: string; funnel_id: string | null }[] } })
    .compare?.funnels
  const anomalies = (compare ?? []).filter((f) =>
    /higher|lower/i.test(f.change_note)
  )
  return { ok: true, anomalies, note: 'Anomalies are OBSERVED window differences — not root causes.' }
}

export async function financeHealth(): Promise<Record<string, unknown>> {
  const snap = await financeSnapshot({ days: 7 })
  return {
    ok: true,
    lurvox_data_status: (snap as { lurvox_product_revenue?: { data_status?: string } })
      .lurvox_product_revenue?.data_status,
    funnel_rows: Array.isArray((snap as { meta_by_funnel?: unknown[] }).meta_by_funnel)
      ? (snap as { meta_by_funnel: unknown[] }).meta_by_funnel.length
      : 0,
    note: 'Phase 19 finance health.',
  }
}
