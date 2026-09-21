/**
 * Jarvis read path for LURVOX paid revenue.
 * Calculation: src/lib/payments/purchase-revenue.ts
 * Contract: src/lib/jarvis/metrics/source-of-truth.ts (lurvox_product_revenue)
 * Timezone: Asia/Kolkata calendar days (explicit Jarvis requirement).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { metricProvenance } from '@/lib/jarvis/diagnostics/provenance'
import {
  BUSINESS_TIMEZONE,
  businessToday,
  businessYesterday,
  calendarDateRange,
  lastNCalendarDays,
  zonedYmd,
} from '@/lib/time/business-calendar'
import type { DataStatus, MetricProvenance } from '@/lib/jarvis/diagnostics/diagnostic-types'
import {
  filterPurchaseWindow,
  purchaseLedgerFromQuery,
  summarizePurchaseLedger,
  type PurchaseLedgerRow,
} from '@/lib/payments/purchase-revenue'
import {
  LURVOX_PRODUCT_REVENUE_METRIC,
  SOURCE_OF_TRUTH_NOT_VERIFIED,
  requireVerifiedMetricSource,
  sourceAllowedForMetric,
} from '@/lib/jarvis/metrics/source-of-truth'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const CALCULATION_METHOD =
  'gross = sum(amount_paise)/100 where status=captured; refunds = sum(refunded_amount_paise)/100 where status in (captured, refunded); redeemed codes excluded from cash revenue'

export type LurvoxRevenuePreset = 'today' | 'yesterday' | 'last_n_days' | 'range'

export type LurvoxRevenueInput = {
  preset?: LurvoxRevenuePreset
  days?: number
  from?: string
  to?: string
  now?: Date
}

export type LurvoxDayPoint = {
  date: string
  gross_inr: number
  refunds_inr: number
  net_inr: number
  paid_count: number
  redemption_count: number
}

export type LurvoxRevenueResult = {
  ok: boolean
  metric: typeof LURVOX_PRODUCT_REVENUE_METRIC
  source: string
  data_status: DataStatus
  period_start: string | null
  period_end: string | null
  timezone: string
  currency: string
  calculation_method: string
  gross_inr: number | null
  refunds_inr: number | null
  net_inr: number | null
  paid_count: number | null
  redemption_count: number | null
  redemption_inr: number | null
  by_day: LurvoxDayPoint[]
  by_plan: { plan_slug: string; gross_inr: number; paid_count: number }[]
  provenance: MetricProvenance
  note: string
  error?: string
}

function unavailableResult(
  note: string,
  data_status: DataStatus,
  window?: { start: Date; endExclusive: Date }
): LurvoxRevenueResult {
  const provenance = metricProvenance({
    metric: LURVOX_PRODUCT_REVENUE_METRIC,
    value: null,
    currency: 'INR',
    period: window
      ? { start: window.start.toISOString(), end: window.endExclusive.toISOString() }
      : null,
    timezone: BUSINESS_TIMEZONE,
    source: 'public.purchases',
    tool_name: 'lurvox.revenue',
    data_status,
    calculation_method: CALCULATION_METHOD,
    note,
  })
  return {
    ok: false,
    metric: LURVOX_PRODUCT_REVENUE_METRIC,
    source: 'public.purchases',
    data_status,
    period_start: window?.start.toISOString() ?? null,
    period_end: window?.endExclusive.toISOString() ?? null,
    timezone: BUSINESS_TIMEZONE,
    currency: 'INR',
    calculation_method: CALCULATION_METHOD,
    gross_inr: null,
    refunds_inr: null,
    net_inr: null,
    paid_count: null,
    redemption_count: null,
    redemption_inr: null,
    by_day: [],
    by_plan: [],
    provenance,
    note,
    error: note,
  }
}

export function resolveLurvoxRevenueWindow(
  input: LurvoxRevenueInput,
  now = input.now ?? new Date()
):
  | { ok: true; start: Date; endExclusive: Date; from_ymd: string; to_ymd: string; label: string }
  | { ok: false; error: string } {
  if (input.from || input.to || input.preset === 'range') {
    const from = input.from
    const to = input.to ?? input.from
    if (!from || !to || !YMD.test(from) || !YMD.test(to)) {
      return { ok: false, error: 'Range requires from/to as YYYY-MM-DD (Asia/Kolkata calendar dates).' }
    }
    if (from > to) return { ok: false, error: 'from must be on or before to.' }
    const range = calendarDateRange(BUSINESS_TIMEZONE, from, to)
    return {
      ok: true,
      start: range.start,
      endExclusive: range.endExclusive,
      from_ymd: range.from_ymd,
      to_ymd: range.to_ymd,
      label: from === to ? from : `${from}..${to}`,
    }
  }

  if (input.preset === 'yesterday') {
    const day = businessYesterday(now)
    return {
      ok: true,
      start: day.start,
      endExclusive: day.endExclusive,
      from_ymd: day.from_ymd,
      to_ymd: day.to_ymd,
      label: 'yesterday',
    }
  }

  if (input.preset === 'last_n_days' || (input.days != null && input.preset !== 'today')) {
    const n = Math.min(90, Math.max(1, input.days ?? 7))
    const range = lastNCalendarDays(BUSINESS_TIMEZONE, now, n)
    return {
      ok: true,
      start: range.start,
      endExclusive: range.endExclusive,
      from_ymd: range.from_ymd,
      to_ymd: range.to_ymd,
      label: `last_${n}_days`,
    }
  }

  const today = businessToday(now)
  return {
    ok: true,
    start: today.start,
    endExclusive: today.endExclusive,
    from_ymd: today.from_ymd,
    to_ymd: today.to_ymd,
    label: 'today',
  }
}

function eachYmd(fromYmd: string, toYmd: string): string[] {
  const days: string[] = []
  let cursor = fromYmd
  days.push(cursor)
  while (cursor < toYmd) {
    const next = calendarDateRange(BUSINESS_TIMEZONE, cursor, cursor)
    cursor = zonedYmd(next.endExclusive, BUSINESS_TIMEZONE)
    days.push(cursor)
    if (days.length > 120) break
  }
  return days
}

export function summarizeLurvoxRows(
  rows: PurchaseLedgerRow[],
  window: { start: Date; endExclusive: Date; from_ymd: string; to_ymd: string }
) {
  const inWindow = filterPurchaseWindow(rows, window.start, window.endExclusive)
  const totals = summarizePurchaseLedger(inWindow)
  const by_day: LurvoxDayPoint[] = eachYmd(window.from_ymd, window.to_ymd).map((date) => {
    const day = calendarDateRange(BUSINESS_TIMEZONE, date, date)
    const dayRows = filterPurchaseWindow(inWindow, day.start, day.endExclusive)
    const s = summarizePurchaseLedger(dayRows)
    return {
      date,
      gross_inr: s.gross_inr,
      refunds_inr: s.refunds_inr,
      net_inr: s.net_inr,
      paid_count: s.paid_count,
      redemption_count: s.redemption_count,
    }
  })
  const planMap = new Map<string, { gross_inr: number; paid_count: number }>()
  for (const row of inWindow) {
    if (row.status !== 'captured' || (row.amount_paise ?? 0) <= 0) continue
    const slug = row.plan_slug || 'unknown'
    const cur = planMap.get(slug) ?? { gross_inr: 0, paid_count: 0 }
    cur.gross_inr += (row.amount_paise ?? 0) / 100
    cur.paid_count += 1
    planMap.set(slug, cur)
  }
  const by_plan = Array.from(planMap.entries())
    .map(([plan_slug, v]) => ({ plan_slug, gross_inr: v.gross_inr, paid_count: v.paid_count }))
    .sort((a, b) => b.gross_inr - a.gross_inr)
  return { totals, by_day, by_plan, inWindow }
}

export function lurvoxRevenueFromQuery(input: {
  query: { data: PurchaseLedgerRow[] | null; error: { message: string } | null }
  window: { start: Date; endExclusive: Date; from_ymd: string; to_ymd: string; label: string }
}): LurvoxRevenueResult {
  const contract = requireVerifiedMetricSource(LURVOX_PRODUCT_REVENUE_METRIC)
  if (contract === SOURCE_OF_TRUTH_NOT_VERIFIED) {
    return unavailableResult(SOURCE_OF_TRUTH_NOT_VERIFIED, 'unavailable', input.window)
  }
  if (!sourceAllowedForMetric(LURVOX_PRODUCT_REVENUE_METRIC, 'public.purchases')) {
    return unavailableResult(
      'Catalog forbids this source for LURVOX product revenue.',
      'unavailable',
      input.window
    )
  }

  const parsed = purchaseLedgerFromQuery(input.query)
  if (!parsed.ok) {
    return unavailableResult(
      `LURVOX revenue unavailable — ${parsed.error}. This is not ₹0.`,
      parsed.data_status,
      input.window
    )
  }

  const { totals, by_day, by_plan } = summarizeLurvoxRows(parsed.rows, input.window)
  const nonInr = parsed.rows.some(
    (row) => row.status === 'captured' && row.currency && row.currency !== 'INR'
  )
  const data_status: DataStatus = nonInr ? 'partial' : 'verified'
  const note = [
    'LURVOX paid revenue from public.purchases (Razorpay). Not Shopify. Not Meta.',
    `Period ${input.window.from_ymd} → ${input.window.to_ymd} ${BUSINESS_TIMEZONE}.`,
    'Redeemed ₹0 enrollment codes are counted separately and are not cash revenue.',
    'gross_inr is captured amount; net_inr subtracts refunded_amount_paise in-window.',
    nonInr ? 'Some captured rows were not INR; those are flagged as partial.' : null,
  ]
    .filter(Boolean)
    .join(' ')

  const provenance = metricProvenance({
    metric: LURVOX_PRODUCT_REVENUE_METRIC,
    value: totals.gross_inr,
    currency: 'INR',
    period: {
      start: input.window.start.toISOString(),
      end: input.window.endExclusive.toISOString(),
      label: input.window.label,
    },
    timezone: BUSINESS_TIMEZONE,
    source: 'public.purchases',
    tool_name: 'lurvox.revenue',
    data_status,
    confidence: data_status === 'verified' ? 'high' : 'medium',
    calculation_method: CALCULATION_METHOD,
    note,
  })

  return {
    ok: true,
    metric: LURVOX_PRODUCT_REVENUE_METRIC,
    source: 'public.purchases',
    data_status,
    period_start: input.window.start.toISOString(),
    period_end: input.window.endExclusive.toISOString(),
    timezone: BUSINESS_TIMEZONE,
    currency: 'INR',
    calculation_method: CALCULATION_METHOD,
    gross_inr: totals.gross_inr,
    refunds_inr: totals.refunds_inr,
    net_inr: totals.net_inr,
    paid_count: totals.paid_count,
    redemption_count: totals.redemption_count,
    redemption_inr: totals.redemption_inr,
    by_day,
    by_plan,
    provenance,
    note,
  }
}

export async function loadLurvoxRevenue(input: LurvoxRevenueInput = {}): Promise<LurvoxRevenueResult> {
  const window = resolveLurvoxRevenueWindow(input)
  if (!window.ok) {
    return unavailableResult(window.error, 'unavailable')
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('purchases')
      .select('status, amount_paise, refunded_amount_paise, currency, created_at, plan_slug')
      .gte('created_at', window.start.toISOString())
      .lt('created_at', window.endExclusive.toISOString())
    return lurvoxRevenueFromQuery({
      query: {
        data: error ? null : (data as PurchaseLedgerRow[] | null),
        error: error ? { message: error.message } : null,
      },
      window,
    })
  } catch (err) {
    return unavailableResult(
      `LURVOX revenue query failed — ${err instanceof Error ? err.message : 'unknown error'}. This is not ₹0.`,
      'failed',
      window
    )
  }
}
