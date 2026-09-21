import { createAdminClient } from '@/lib/supabase/admin'
import {
  listFunnels,
  summarizeFunnelPerformance,
} from '@/lib/ai-marketing/funnels'
import type { FunnelPerformanceSummary } from '@/lib/ai-marketing/types'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { shopifyTodayCommerce } from '@/lib/jarvis/shopify/client'
import { isBraveSearchConfigured } from '@/lib/jarvis/research/brave-search'
import { isVideoProviderConfigured } from '@/lib/jarvis/video/provider'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'

export type PulseStatus = 'ok' | 'not_connected' | 'no_data' | 'error'

export type PulseMetricCell = {
  value: number | null
  display: string
  status: PulseStatus
  source: string
  hint: string
  data_status?: string
  period_start?: string | null
  period_end?: string | null
  timezone?: string
  currency?: string | null
  calculation_method?: string
}

function utcDateOffset(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function formatInrValue(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function cell(input: {
  value: number | null
  status: PulseStatus
  source: string
  hint: string
  kind?: 'inr' | 'number' | 'ratio'
  data_status?: string
  period_start?: string | null
  period_end?: string | null
  timezone?: string
  currency?: string | null
  calculation_method?: string
}): PulseMetricCell {
  const extra = {
    data_status: input.data_status,
    period_start: input.period_start,
    period_end: input.period_end,
    timezone: input.timezone,
    currency: input.currency,
    calculation_method: input.calculation_method,
  }
  if (input.status === 'not_connected') {
    return { value: null, display: 'Not connected', status: input.status, source: input.source, hint: input.hint, ...extra }
  }
  if (input.status === 'error') {
    return { value: null, display: 'Error', status: input.status, source: input.source, hint: input.hint, ...extra }
  }
  if (input.status === 'no_data' || input.value == null || Number.isNaN(Number(input.value))) {
    return { value: null, display: 'No data yet', status: 'no_data', source: input.source, hint: input.hint, ...extra }
  }
  const n = Number(input.value)
  const display =
    input.kind === 'ratio' ? n.toFixed(2) : input.kind === 'number' ? String(Math.round(n)) : formatInrValue(n)
  return { value: n, display, status: 'ok', source: input.source, hint: input.hint, ...extra }
}

function adsTotals(rows: FunnelPerformanceSummary[]) {
  const classified = rows.filter((f) => f.classified)
  const spend = classified.reduce((s, f) => s + (f.spend || 0), 0)
  const purchases = classified.reduce((s, f) => s + (f.purchases || 0), 0)
  const clicks = classified.reduce((s, f) => s + (f.clicks || 0), 0)
  return {
    ad_spend: spend,
    purchases,
    cpa: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 ? classified.reduce((s, f) => s + (f.revenue || 0), 0) / spend : null,
    conversion_rate: clicks > 0 ? purchases / clicks : null,
  }
}

function deltaNote(
  label: string,
  today: number | null,
  yesterday: number | null,
  invert = false
): string | null {
  if (today == null || yesterday == null) return null
  if (yesterday === 0 && today === 0) return null
  const diff = today - yesterday
  if (Math.abs(diff) < 0.01 && yesterday !== 0) return null
  const better = invert ? diff < 0 : diff > 0
  const verb = better ? 'improved' : 'worsened'
  return `${label} ${verb}: ${yesterday.toFixed(2)} → ${today.toFixed(2)}`
}

export async function buildBusinessPulse() {
  const admin = createAdminClient()
  const todayDate = utcDateOffset(0)
  const yesterdayDate = utcDateOffset(1)
  const meta = await loadMetaIntegrationStatus()

  const [
    funnels,
    commerce,
    lurvoxToday,
    { data: todayRows },
    { data: yesterdayRows },
    { data: last7AdRows },
    { data: research },
    { data: digest },
    approvals,
    lurvoxYesterday,
    lurvoxLast7,
  ] = await Promise.all([
    listFunnels().catch(() => []),
    shopifyTodayCommerce(),
    loadLurvoxRevenue({ preset: 'today' }),
    admin.from('marketing_performance').select('*').eq('date', todayDate),
    admin.from('marketing_performance').select('*').eq('date', yesterdayDate),
    admin
      .from('marketing_performance')
      .select('date, spend, purchases')
      .gte('date', utcDateOffset(6))
      .lte('date', todayDate),
    admin
      .from('jarvis_research')
      .select('id, question, conclusion, key_findings, status, created_at, confidence')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('jarvis_activity_digests')
      .select('*')
      .order('digest_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    listPendingApprovals(8),
    loadLurvoxRevenue({ preset: 'yesterday' }),
    loadLurvoxRevenue({ preset: 'last_n_days', days: 7 }),
  ])

  const todayByFunnel: FunnelPerformanceSummary[] = funnels.map((funnel) =>
    summarizeFunnelPerformance(
      funnel,
      (todayRows ?? []).filter((r) => r.funnel_id === funnel.id)
    )
  )
  const yesterdayByFunnel: FunnelPerformanceSummary[] = funnels.map((funnel) =>
    summarizeFunnelPerformance(
      funnel,
      (yesterdayRows ?? []).filter((r) => r.funnel_id === funnel.id)
    )
  )

  const adsConnected = meta.configured
  const todayHasAds = adsConnected && (todayRows ?? []).length > 0
  const ads = todayHasAds ? adsTotals(todayByFunnel) : null

  const lurvoxFailed =
    lurvoxToday.data_status === 'failed' || lurvoxToday.data_status === 'unavailable' || lurvoxToday.data_status === 'unknown'
  const revenue = lurvoxFailed
    ? cell({
        value: null,
        status: 'error',
        source: lurvoxToday.source,
        hint: lurvoxToday.note,
        kind: 'inr',
        data_status: lurvoxToday.data_status,
        period_start: lurvoxToday.period_start,
        period_end: lurvoxToday.period_end,
        timezone: lurvoxToday.timezone,
        currency: lurvoxToday.currency,
        calculation_method: lurvoxToday.calculation_method,
      })
    : cell({
        value: lurvoxToday.gross_inr,
        status: 'ok',
        source: lurvoxToday.source,
        hint: `LURVOX paid revenue (captured purchases, ${lurvoxToday.timezone}). Not Shopify. Not Meta.`,
        kind: 'inr',
        data_status: lurvoxToday.data_status,
        period_start: lurvoxToday.period_start,
        period_end: lurvoxToday.period_end,
        timezone: lurvoxToday.timezone,
        currency: lurvoxToday.currency,
        calculation_method: lurvoxToday.calculation_method,
      })

  const orders = lurvoxFailed
    ? cell({
        value: null,
        status: 'error',
        source: lurvoxToday.source,
        hint: lurvoxToday.note,
        kind: 'number',
        data_status: lurvoxToday.data_status,
        period_start: lurvoxToday.period_start,
        period_end: lurvoxToday.period_end,
        timezone: lurvoxToday.timezone,
        currency: lurvoxToday.currency,
        calculation_method: lurvoxToday.calculation_method,
      })
    : cell({
        value: lurvoxToday.paid_count,
        status: 'ok',
        source: lurvoxToday.source,
        hint: 'LURVOX paid captured purchases (amount_paise > 0). Not Shopify orders. Not Meta ad purchases.',
        kind: 'number',
        data_status: lurvoxToday.data_status,
        period_start: lurvoxToday.period_start,
        period_end: lurvoxToday.period_end,
        timezone: lurvoxToday.timezone,
        currency: lurvoxToday.currency,
        calculation_method: lurvoxToday.calculation_method,
      })

  const lurvoxYesterdayFailed =
    lurvoxYesterday.data_status === 'failed' ||
    lurvoxYesterday.data_status === 'unavailable' ||
    lurvoxYesterday.data_status === 'unknown'
  const yesterdayRevenue = lurvoxYesterdayFailed
    ? cell({
        value: null,
        status: 'error',
        source: lurvoxYesterday.source,
        hint: lurvoxYesterday.note,
        kind: 'inr',
        data_status: lurvoxYesterday.data_status,
        timezone: lurvoxYesterday.timezone,
      })
    : cell({
        value: lurvoxYesterday.gross_inr,
        status: 'ok',
        source: lurvoxYesterday.source,
        hint: 'LURVOX paid revenue yesterday (Asia/Kolkata).',
        kind: 'inr',
        data_status: lurvoxYesterday.data_status,
        timezone: lurvoxYesterday.timezone,
      })
  const yesterdayOrders = lurvoxYesterdayFailed
    ? cell({
        value: null,
        status: 'error',
        source: lurvoxYesterday.source,
        hint: lurvoxYesterday.note,
        kind: 'number',
        data_status: lurvoxYesterday.data_status,
        timezone: lurvoxYesterday.timezone,
      })
    : cell({
        value: lurvoxYesterday.paid_count,
        status: 'ok',
        source: lurvoxYesterday.source,
        hint: 'LURVOX paid sales yesterday (Asia/Kolkata).',
        kind: 'number',
        data_status: lurvoxYesterday.data_status,
        timezone: lurvoxYesterday.timezone,
      })

  const aov =
    lurvoxFailed
      ? cell({
          value: null,
          status: 'error',
          source: lurvoxToday.source,
          hint: lurvoxToday.note,
          kind: 'inr',
          data_status: lurvoxToday.data_status,
          timezone: lurvoxToday.timezone,
        })
      : lurvoxToday.paid_count && lurvoxToday.paid_count > 0 && lurvoxToday.gross_inr != null
        ? cell({
            value: lurvoxToday.gross_inr / lurvoxToday.paid_count,
            status: 'ok',
            source: lurvoxToday.source,
            hint: 'Gross paid revenue ÷ paid sales (LURVOX).',
            kind: 'inr',
            data_status: lurvoxToday.data_status,
            timezone: lurvoxToday.timezone,
          })
        : cell({
            value: null,
            status: 'no_data',
            source: lurvoxToday.source,
            hint: 'AOV needs at least one paid sale today.',
            kind: 'inr',
            data_status: lurvoxToday.data_status,
            timezone: lurvoxToday.timezone,
          })

  const lurvoxLast7Ok =
    lurvoxLast7.data_status !== 'failed' &&
    lurvoxLast7.data_status !== 'unavailable' &&
    lurvoxLast7.data_status !== 'unknown'
  const revenue_7d = lurvoxLast7Ok
    ? lurvoxLast7.by_day.map((d) => ({ date: d.date, value: d.gross_inr }))
    : []
  const sales_7d = lurvoxLast7Ok
    ? lurvoxLast7.by_day.map((d) => ({ date: d.date, value: d.paid_count }))
    : []

  const adsByDay = new Map<string, { spend: number; purchases: number }>()
  for (const row of last7AdRows ?? []) {
    const date = String((row as { date?: string }).date || '')
    if (!date) continue
    const cur = adsByDay.get(date) ?? { spend: 0, purchases: 0 }
    cur.spend += Number((row as { spend?: number }).spend || 0)
    cur.purchases += Number((row as { purchases?: number }).purchases || 0)
    adsByDay.set(date, cur)
  }
  const ads_7d =
    adsConnected && adsByDay.size
      ? Array.from(adsByDay.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ date, value: v.spend, purchases: v.purchases }))
      : null

  const adsHintMissing = 'Ad performance unavailable — connect Meta Ads.'
  const adsHintEmpty = 'No Meta performance rows for today yet.'
  const ad_spend = !adsConnected
    ? cell({ value: null, status: 'not_connected', source: 'meta', hint: adsHintMissing, kind: 'inr' })
    : !todayHasAds
      ? cell({ value: null, status: 'no_data', source: 'meta', hint: adsHintEmpty, kind: 'inr' })
      : cell({
          value: ads!.ad_spend,
          status: 'ok',
          source: 'meta',
          hint: 'Meta / marketing_performance ad spend. This is not store revenue.',
          kind: 'inr',
        })
  const purchases = !adsConnected
    ? cell({ value: null, status: 'not_connected', source: 'meta', hint: adsHintMissing, kind: 'number' })
    : !todayHasAds
      ? cell({ value: null, status: 'no_data', source: 'meta', hint: adsHintEmpty, kind: 'number' })
      : cell({
          value: ads!.purchases,
          status: 'ok',
          source: 'meta',
          hint: 'Meta-reported purchases. Do not treat as Shopify orders.',
          kind: 'number',
        })
  const cpa = !adsConnected
    ? cell({ value: null, status: 'not_connected', source: 'meta', hint: adsHintMissing, kind: 'inr' })
    : !todayHasAds
      ? cell({ value: null, status: 'no_data', source: 'meta', hint: adsHintEmpty, kind: 'inr' })
      : cell({
          value: ads!.cpa,
          status: ads!.cpa == null ? 'no_data' : 'ok',
          source: 'meta',
          hint: ads!.cpa == null ? 'CPA needs purchases today.' : 'Per-funnel Meta CPA; not blended across offers.',
          kind: 'inr',
        })
  const roas = !adsConnected
    ? cell({ value: null, status: 'not_connected', source: 'meta', hint: adsHintMissing, kind: 'ratio' })
    : !todayHasAds
      ? cell({ value: null, status: 'no_data', source: 'meta', hint: adsHintEmpty, kind: 'ratio' })
      : cell({
          value: ads!.roas,
          status: ads!.roas == null ? 'no_data' : 'ok',
          source: 'meta',
          hint: 'Initial Meta ROAS from ad-attributed conversion value, not Shopify revenue.',
          kind: 'ratio',
        })

  const attention: string[] = []
  const opportunities: string[] = []
  const wins: string[] = []

  if (lurvoxFailed) {
    attention.push('LURVOX paid revenue could not be read from public.purchases — not ₹0.')
  }

  if (!commerce.connected) {
    attention.push('Shopify store commerce unavailable — connect Shopify for store orders.')
  } else if (!commerce.ok) {
    attention.push('Shopify is configured but store orders could not be read.')
  }

  if (!adsConnected) {
    attention.push('Ad spend unavailable — connect Meta Ads.')
  }

  if (!isBraveSearchConfigured()) {
    opportunities.push('Live web research unavailable — BRAVE_SEARCH_API_KEY is not configured.')
  }
  if (!isVideoProviderConfigured()) {
    opportunities.push('Video rendering unavailable — no video provider is configured.')
  }

  if (todayHasAds) {
    for (const f of todayByFunnel) {
      if (!f.classified) continue
      const y = yesterdayByFunnel.find((x) => x.funnel_id === f.funnel_id)
      const cpaNote = deltaNote(`${f.funnel_name} CPA`, f.cpa, y?.cpa ?? null, true)
      const roasNote = deltaNote(`${f.funnel_name} ROAS`, f.initial_roas, y?.initial_roas ?? null)
      if (cpaNote?.includes('worsened')) attention.push(cpaNote)
      if (roasNote?.includes('worsened')) attention.push(roasNote)
      if (cpaNote?.includes('improved')) wins.push(cpaNote)
      if (roasNote?.includes('improved')) wins.push(roasNote)
      if (f.cpa != null && f.max_acceptable_cpa != null && f.spend > 0 && f.cpa > f.max_acceptable_cpa) {
        attention.push(
          `${f.funnel_name}: CPA ₹${Math.round(f.cpa)} is above max ₹${Math.round(f.max_acceptable_cpa)}.`
        )
      }
      if (f.initial_roas != null && f.target_roas != null && f.spend > 0 && f.initial_roas >= f.target_roas) {
        wins.push(`${f.funnel_name}: ROAS ${f.initial_roas.toFixed(2)} is at or above target ${f.target_roas}.`)
      }
    }

    const unclassifiedToday = (todayRows ?? []).filter((r) => !r.funnel_id)
    const unclassifiedSpend = unclassifiedToday.reduce((s, r) => s + Number(r.spend || 0), 0)
    if (unclassifiedSpend > 0) {
      attention.push(`Unclassified ad spend ₹${Math.round(unclassifiedSpend)} today — campaigns need a funnel.`)
    }
  }

  const digestRow = digest ?? null
  if (Array.isArray(digestRow?.recommends)) {
    for (const item of digestRow.recommends.slice(0, 5)) {
      if (typeof item === 'string' && item.trim()) opportunities.push(item)
    }
  }
  if (Array.isArray(digestRow?.observed)) {
    for (const item of digestRow.observed.slice(0, 3)) {
      if (typeof item === 'string' && item.trim() && !attention.includes(item)) {
        attention.push(item)
      }
    }
  }

  if (approvals.length) {
    attention.push(`${approvals.length} approval${approvals.length === 1 ? '' : 's'} waiting.`)
  }

  const researchFindings = (research ?? []).map((r) => ({
    id: r.id,
    title: r.question,
    finding: r.conclusion || (Array.isArray(r.key_findings) ? String(r.key_findings[0] ?? '') : ''),
    confidence: r.confidence,
    created_at: r.created_at,
  }))

  const noteParts = [
    lurvoxFailed
      ? 'LURVOX paid revenue is unavailable — not ₹0.'
      : 'Business revenue is LURVOX paid purchases (public.purchases, Asia/Kolkata).',
    commerce.connected && commerce.ok
      ? 'Shopify figures are store commerce only.'
      : 'Shopify store commerce is not connected or could not be read.',
    adsConnected
      ? 'Ad spend, purchases, CPA, and ROAS are Meta / marketing_performance — not cash revenue.'
      : 'Meta Ads is not connected.',
    '₹99 and ₹1,699 funnels stay separate. Meta ad spend is never treated as revenue.',
  ]

  return {
    as_of: todayDate,
    today: {
      revenue,
      orders,
      ad_spend,
      purchases,
      cpa,
      roas,
      conversion_rate: !adsConnected
        ? cell({ value: null, status: 'not_connected', source: 'meta', hint: adsHintMissing, kind: 'ratio' })
        : !todayHasAds
          ? cell({ value: null, status: 'no_data', source: 'meta', hint: adsHintEmpty, kind: 'ratio' })
          : cell({
              value: ads!.conversion_rate,
              status: ads!.conversion_rate == null ? 'no_data' : 'ok',
              source: 'meta',
              hint: 'Meta clicks → purchases. Not a Shopify conversion rate.',
              kind: 'ratio',
            }),
      aov,
    },
    yesterday: {
      revenue: yesterdayRevenue,
      orders: yesterdayOrders,
    },
    series: {
      revenue_7d,
      sales_7d,
      ads_7d,
    },
    by_plan: lurvoxFailed ? [] : lurvoxToday.by_plan,
    shopify: commerce.connected && commerce.ok
      ? {
          connected: true,
          source: 'shopify',
          as_of: commerce.as_of,
          aov: commerce.aov,
          orders: commerce.orders,
          revenue: commerce.revenue,
          refunds_count: commerce.refunds_count,
          refunds_amount: commerce.refunds_amount,
          currency: commerce.currency,
          products: commerce.products,
          note: commerce.note,
          data_status: commerce.data_status,
          provenance: commerce.provenance,
        }
      : {
          connected: false,
          source: 'shopify',
          unavailable_reason: !commerce.connected
            ? commerce.unavailable_reason
            : commerce.error,
          data_status: commerce.data_status,
          provenance: commerce.provenance,
        },
    funnel_health: todayByFunnel.map((f) => ({
      funnel_id: f.funnel_id,
      funnel_name: f.funnel_name,
      funnel_slug: f.funnel_slug,
      price_inr: f.price_inr,
      spend: todayHasAds ? cell({
        value: f.spend,
        status: 'ok',
        source: 'meta',
        hint: `${f.funnel_name} Meta spend only.`,
        kind: 'inr',
      }) : cell({
        value: null,
        status: adsConnected ? 'no_data' : 'not_connected',
        source: 'meta',
        hint: adsConnected ? adsHintEmpty : adsHintMissing,
        kind: 'inr',
      }),
      purchases: todayHasAds ? cell({
        value: f.purchases,
        status: 'ok',
        source: 'meta',
        hint: `${f.funnel_name} Meta purchases. Not Shopify orders.`,
        kind: 'number',
      }) : cell({
        value: null,
        status: adsConnected ? 'no_data' : 'not_connected',
        source: 'meta',
        hint: adsConnected ? adsHintEmpty : adsHintMissing,
        kind: 'number',
      }),
      cpa: todayHasAds
        ? cell({
            value: f.cpa,
            status: f.cpa == null ? 'no_data' : 'ok',
            source: 'meta',
            hint: `${f.funnel_name} CPA. Never blended with the other offer.`,
            kind: 'inr',
          })
        : cell({
            value: null,
            status: adsConnected ? 'no_data' : 'not_connected',
            source: 'meta',
            hint: adsConnected ? adsHintEmpty : adsHintMissing,
            kind: 'inr',
          }),
      roas: todayHasAds
        ? cell({
            value: f.initial_roas,
            status: f.initial_roas == null ? 'no_data' : 'ok',
            source: 'meta',
            hint: `${f.funnel_name} initial ROAS from ads, not Shopify revenue.`,
            kind: 'ratio',
          })
        : cell({
            value: null,
            status: adsConnected ? 'no_data' : 'not_connected',
            source: 'meta',
            hint: adsConnected ? adsHintEmpty : adsHintMissing,
            kind: 'ratio',
          }),
      target_cpa: f.target_cpa,
      max_acceptable_cpa: f.max_acceptable_cpa,
      target_roas: f.target_roas,
      available: Boolean(todayHasAds && f.classified && f.spend > 0),
    })),
    attention: attention.slice(0, 8),
    opportunities: opportunities.slice(0, 8),
    wins: wins.slice(0, 8),
    research: researchFindings,
    research_unavailable: !isBraveSearchConfigured()
      ? 'Live web research unavailable — BRAVE_SEARCH_API_KEY is not configured.'
      : null,
    yesterday_available: adsConnected && (yesterdayRows ?? []).length > 0,
    note: noteParts.join(' '),
  }
}
