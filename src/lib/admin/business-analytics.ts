import { calculateAiCostUsd, calculateRazorpayFeeInr, usdToInr } from '@/lib/admin/pricing'
import { DEFAULTS, MODELS } from '@/lib/ai/config'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiGenerationLog, Purchase } from '@/types/database'

export type DayPoint = { date: string; value: number }
export type ModelCostPoint = { model: string; costUsd: number }

export type RevenueMetrics = {
  todayInr: number
  yesterdayInr: number
  weekInr: number
  monthInr: number
  lifetimeInr: number
}

export type CustomerMetrics = {
  totalCustomers: number
  activeCustomers: number
  newToday: number
  newThisMonth: number
}

export type PlanMetrics = {
  totalGenerated: number
  activePlans: number
  draftPlans: number
}

export type SupportMetrics = {
  open: number
  claimed: number
  closed: number
}

export type AiCostMetrics = {
  todayUsd: number
  weekUsd: number
  monthUsd: number
  lifetimeUsd: number
  avgPerGenerationUsd: number | null
  avgPerClientUsd: number | null
  avgPerPlanUsd: number | null
  estimatedMonthlySpendUsd: number
  costByModel: ModelCostPoint[]
  costByDay: DayPoint[]
  avgTokensPerGeneration: number | null
  mostExpensiveUsd: number | null
  cheapestUsd: number | null
  successRate: number | null
  validationFailureRate: number | null
  retryRate: number | null
}

export type ProfitMetrics = {
  revenueInr: number
  razorpayFeesInr: number
  aiCostInr: number
  netRevenueInr: number
  grossProfitInr: number
  grossMarginPercent: number | null
  aiCostPercent: number | null
  paymentFeePercent: number | null
  avgProfitPerClientInr: number | null
}

export type PlatformStatusMetrics = {
  anthropicStatus: 'configured' | 'not_configured'
  currentModel: string
  lastSuccessfulGeneration: string | null
  generationSuccessRate: number | null
  databaseStatus: 'healthy' | 'degraded' | 'unknown'
  storageStatus: 'healthy' | 'degraded' | 'unknown'
  jsonValidationSuccessRate: number | null
  averageGenerationTimeMs: number | null
}

export type ChartSeries = {
  revenueByDay: DayPoint[]
  revenueByMonth: DayPoint[]
  aiCostByDay: DayPoint[]
  aiCostByModel: ModelCostPoint[]
  customerGrowth: DayPoint[]
  purchasesPerDay: DayPoint[]
  plansPerDay: DayPoint[]
  supportPerDay: DayPoint[]
}

export type BusinessAnalytics = {
  revenue: RevenueMetrics
  customers: CustomerMetrics
  plans: PlanMetrics
  support: SupportMetrics
  aiCosts: AiCostMetrics
  profit: ProfitMetrics
  platform: PlatformStatusMetrics
  charts: ChartSeries
}

type PurchaseRow = Pick<Purchase, 'id' | 'user_id' | 'amount_paise' | 'created_at' | 'status'>
type AiLogRow = Pick<
  AiGenerationLog,
  | 'id'
  | 'client_id'
  | 'model'
  | 'prompt_tokens'
  | 'completion_tokens'
  | 'total_cost_usd'
  | 'input_cost_usd'
  | 'output_cost_usd'
  | 'success'
  | 'retry_count'
  | 'validation_result'
  | 'latency_ms'
  | 'created_at'
>

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  const diff = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - diff)
  return day
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function sumPurchaseInr(rows: PurchaseRow[], from?: Date, to?: Date): number {
  return (
    rows
      .filter((r) => r.status === 'captured')
      .filter((r) => {
        const t = new Date(r.created_at).getTime()
        if (from && t < from.getTime()) return false
        if (to && t >= to.getTime()) return false
        return true
      })
      .reduce((sum, r) => sum + r.amount_paise, 0) / 100
  )
}

function resolveLogCostUsd(log: AiLogRow): number {
  if (log.total_cost_usd != null) return Number(log.total_cost_usd)
  return calculateAiCostUsd(log.model, log.prompt_tokens, log.completion_tokens).totalCostUsd
}

function aggregateByDay(rows: { created_at: string; value: number }[]): DayPoint[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = isoDay(new Date(row.created_at))
    map.set(key, (map.get(key) ?? 0) + row.value)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
}

function aggregateByMonth(rows: { created_at: string; value: number }[]): DayPoint[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = isoMonth(new Date(row.created_at))
    map.set(key, (map.get(key) ?? 0) + row.value)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }))
}

function uniqueDays(rows: { user_id: string | null; created_at: string }[], from?: Date, to?: Date): number {
  const set = new Set<string>()
  for (const row of rows) {
    if (!row.user_id) continue
    const t = new Date(row.created_at)
    if (from && t < from) continue
    if (to && t >= to) continue
    set.add(row.user_id)
  }
  return set.size
}

export async function computeBusinessAnalytics(): Promise<BusinessAnalytics> {
  const admin = createAdminClient()
  const now = new Date()
  const todayStart = startOfDay(now)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)
  const nextDay = new Date(todayStart)
  nextDay.setDate(nextDay.getDate() + 1)

  const since90 = new Date(todayStart)
  since90.setDate(since90.getDate() - 90)

  const [
    purchasesRes,
    clientsRes,
    activeClientsRes,
    plansCountRes,
    plansTimelineRes,
    activePlansRes,
    draftPlansRes,
    supportRes,
    aiLogsRes,
    aiLogsLifetimeRes,
    storageRes,
  ] = await Promise.all([
    admin.from('purchases').select('id, user_id, amount_paise, created_at, status').order('created_at', { ascending: false }),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
    admin.from('plans').select('client_id').eq('active', true),
    admin.from('plans').select('id', { count: 'exact', head: true }),
    admin.from('plans').select('id, created_at').gte('created_at', since90.toISOString()),
    admin.from('plans').select('id', { count: 'exact', head: true }).eq('active', true),
    admin.from('plans').select('id', { count: 'exact', head: true }).eq('active', false),
    admin.from('support_requests').select('status'),
    admin
      .from('ai_generation_logs')
      .select(
        'id, client_id, model, prompt_tokens, completion_tokens, total_cost_usd, input_cost_usd, output_cost_usd, success, retry_count, validation_result, latency_ms, created_at'
      )
      .gte('created_at', since90.toISOString())
      .order('created_at', { ascending: false }),
    admin
      .from('ai_generation_logs')
      .select(
        'id, client_id, model, prompt_tokens, completion_tokens, total_cost_usd, input_cost_usd, output_cost_usd, success, retry_count, validation_result, latency_ms, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(5000),
    admin.storage.listBuckets(),
  ])

  const purchases = (purchasesRes.data ?? []) as PurchaseRow[]
  const aiLogs = (aiLogsRes.data ?? []) as AiLogRow[]
  const aiLogsLifetime = (aiLogsLifetimeRes.data ?? []) as AiLogRow[]
  const activeClientIds = new Set(
    ((activeClientsRes.data ?? []) as { client_id: string }[]).map((p) => p.client_id)
  )

  const revenue: RevenueMetrics = {
    todayInr: sumPurchaseInr(purchases, todayStart, nextDay),
    yesterdayInr: sumPurchaseInr(purchases, yesterdayStart, todayStart),
    weekInr: sumPurchaseInr(purchases, weekStart),
    monthInr: sumPurchaseInr(purchases, monthStart),
    lifetimeInr: sumPurchaseInr(purchases),
  }

  const customers: CustomerMetrics = {
    totalCustomers: clientsRes.count ?? 0,
    activeCustomers: activeClientIds.size,
    newToday: uniqueDays(purchases, todayStart, nextDay),
    newThisMonth: uniqueDays(purchases, monthStart),
  }

  const plans: PlanMetrics = {
    totalGenerated: plansCountRes.count ?? 0,
    activePlans: activePlansRes.count ?? 0,
    draftPlans: draftPlansRes.count ?? 0,
  }

  const supportRows = (supportRes.data ?? []) as { status: string }[]
  const support: SupportMetrics = {
    open: supportRows.filter((s) => s.status === 'open').length,
    claimed: supportRows.filter((s) => s.status === 'claimed').length,
    closed: supportRows.filter((s) => s.status === 'closed').length,
  }

  const costs = aiLogs.map((log) => ({ log, cost: resolveLogCostUsd(log) }))
  const lifetimeCosts = aiLogsLifetime.map((log) => ({ log, cost: resolveLogCostUsd(log) }))
  const sumCost = (rows: typeof costs, from?: Date, to?: Date) =>
    rows
      .filter(({ log }) => {
        const t = new Date(log.created_at).getTime()
        if (from && t < from.getTime()) return false
        if (to && t >= to.getTime()) return false
        return true
      })
      .reduce((sum, { cost }) => sum + cost, 0)

  const monthCost = sumCost(costs, monthStart)
  const daysInMonth = now.getDate()
  const estimatedMonthlySpendUsd = daysInMonth > 0 ? (monthCost / daysInMonth) * 30 : monthCost

  const costValues = costs.map((c) => c.cost).filter((v) => v > 0)

  const modelMap = new Map<string, number>()
  for (const { log, cost } of costs) {
    const key = log.model ?? 'unknown'
    modelMap.set(key, (modelMap.get(key) ?? 0) + cost)
  }

  const totalTokens = aiLogs.reduce(
    (sum, l) => sum + (l.prompt_tokens ?? 0) + (l.completion_tokens ?? 0),
    0
  )
  const successCount = aiLogs.filter((l) => l.success).length
  const totalAttempts = aiLogs.length

  const aiCosts: AiCostMetrics = {
    todayUsd: Math.round(sumCost(costs, todayStart, nextDay) * 1_000_000) / 1_000_000,
    weekUsd: Math.round(sumCost(costs, weekStart) * 1_000_000) / 1_000_000,
    monthUsd: Math.round(monthCost * 1_000_000) / 1_000_000,
    lifetimeUsd: Math.round(sumCost(lifetimeCosts) * 1_000_000) / 1_000_000,
    avgPerGenerationUsd:
      lifetimeCosts.length > 0
        ? Math.round((sumCost(lifetimeCosts) / lifetimeCosts.length) * 1_000_000) / 1_000_000
        : null,
    avgPerClientUsd:
      new Set(lifetimeCosts.map(({ log }) => log.client_id).filter(Boolean)).size > 0
        ? Math.round(
            (sumCost(lifetimeCosts) /
              new Set(lifetimeCosts.map(({ log }) => log.client_id).filter(Boolean)).size) *
              1_000_000
          ) / 1_000_000
        : null,
    avgPerPlanUsd:
      (plans.activePlans ?? 0) > 0
        ? Math.round((sumCost(lifetimeCosts) / (plans.activePlans ?? 1)) * 1_000_000) / 1_000_000
        : null,
    estimatedMonthlySpendUsd: Math.round(estimatedMonthlySpendUsd * 100) / 100,
    costByModel: Array.from(modelMap.entries())
      .map(([model, costUsd]) => ({ model, costUsd: Math.round(costUsd * 1_000_000) / 1_000_000 }))
      .sort((a, b) => b.costUsd - a.costUsd),
    costByDay: aggregateByDay(
      costs.map(({ log, cost }) => ({ created_at: log.created_at, value: cost }))
    ),
    avgTokensPerGeneration: totalAttempts > 0 ? Math.round(totalTokens / totalAttempts) : null,
    mostExpensiveUsd: costValues.length > 0 ? Math.max(...costValues) : null,
    cheapestUsd: costValues.length > 0 ? Math.min(...costValues) : null,
    successRate: totalAttempts > 0 ? Math.round((successCount / totalAttempts) * 1000) / 10 : null,
    validationFailureRate:
      totalAttempts > 0
        ? Math.round(
            (aiLogs.filter((l) => !l.success && l.validation_result?.toLowerCase() !== 'pass').length /
              totalAttempts) *
              1000
          ) / 10
        : null,
    retryRate:
      totalAttempts > 0
        ? Math.round((aiLogs.filter((l) => (l.retry_count ?? 0) > 0).length / totalAttempts) * 1000) / 10
        : null,
  }

  const lifetimeRevenueInr = revenue.lifetimeInr
  const razorpayFeesInr = purchases
    .filter((p) => p.status === 'captured')
    .reduce((sum, p) => sum + calculateRazorpayFeeInr(p.amount_paise), 0)
  const aiCostInr = usdToInr(aiCosts.lifetimeUsd)
  const netRevenueInr = Math.round((lifetimeRevenueInr - razorpayFeesInr) * 100) / 100
  const grossProfitInr = Math.round((netRevenueInr - aiCostInr) * 100) / 100

  const profit: ProfitMetrics = {
    revenueInr: lifetimeRevenueInr,
    razorpayFeesInr: Math.round(razorpayFeesInr * 100) / 100,
    aiCostInr,
    netRevenueInr,
    grossProfitInr,
    grossMarginPercent:
      lifetimeRevenueInr > 0 ? Math.round((grossProfitInr / lifetimeRevenueInr) * 1000) / 10 : null,
    aiCostPercent:
      lifetimeRevenueInr > 0 ? Math.round((aiCostInr / lifetimeRevenueInr) * 1000) / 10 : null,
    paymentFeePercent:
      lifetimeRevenueInr > 0 ? Math.round((razorpayFeesInr / lifetimeRevenueInr) * 1000) / 10 : null,
    avgProfitPerClientInr:
      customers.totalCustomers > 0
        ? Math.round((grossProfitInr / customers.totalCustomers) * 100) / 100
        : null,
  }

  const latencies = aiLogs.map((l) => l.latency_ms).filter((v): v is number => typeof v === 'number')
  const jsonValidationSuccessRate =
    totalAttempts > 0
      ? Math.round((aiLogs.filter((l) => l.validation_result?.toLowerCase() === 'pass').length / totalAttempts) * 1000) / 10
      : null

  const platform: PlatformStatusMetrics = {
    anthropicStatus: process.env.ANTHROPIC_API_KEY?.trim() ? 'configured' : 'not_configured',
    currentModel: DEFAULTS.DEFAULT_MODEL || MODELS.CLAUDE_SONNET,
    lastSuccessfulGeneration: aiLogsLifetime.find((l) => l.success)?.created_at ?? null,
    generationSuccessRate: aiCosts.successRate,
    databaseStatus: purchasesRes.error || aiLogsRes.error ? 'degraded' : 'healthy',
    storageStatus: storageRes.error ? 'degraded' : 'healthy',
    jsonValidationSuccessRate,
    averageGenerationTimeMs:
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
  }

  const capturedPurchases = purchases.filter((p) => p.status === 'captured')
  const planRows = (plansTimelineRes.data ?? []) as { id: string; created_at: string }[]

  const customerGrowthMap = new Map<string, Set<string>>()
  for (const p of capturedPurchases) {
    if (!p.user_id) continue
    const day = isoDay(new Date(p.created_at))
    if (!customerGrowthMap.has(day)) customerGrowthMap.set(day, new Set())
    customerGrowthMap.get(day)!.add(p.user_id)
  }
  let running = 0
  const customerGrowth: DayPoint[] = Array.from(customerGrowthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ids]) => {
      running += ids.size
      return { date, value: running }
    })

  const charts: ChartSeries = {
    revenueByDay: aggregateByDay(
      capturedPurchases.map((p) => ({ created_at: p.created_at, value: p.amount_paise / 100 }))
    ),
    revenueByMonth: aggregateByMonth(
      capturedPurchases.map((p) => ({ created_at: p.created_at, value: p.amount_paise / 100 }))
    ),
    aiCostByDay: aggregateByDay(
      costs.map(({ log, cost }) => ({ created_at: log.created_at, value: cost }))
    ),
    aiCostByModel: aiCosts.costByModel,
    customerGrowth,
    purchasesPerDay: aggregateByDay(capturedPurchases.map((p) => ({ created_at: p.created_at, value: 1 }))),
    plansPerDay: aggregateByDay(planRows.map((p) => ({ created_at: p.created_at, value: 1 }))),
    supportPerDay: [] as DayPoint[],
  }

  // Support per day from actual support requests
  const { data: supportTimeline } = await admin
    .from('support_requests')
    .select('created_at')
    .gte('created_at', since90.toISOString())
  charts.supportPerDay = aggregateByDay(
    ((supportTimeline ?? []) as { created_at: string }[]).map((s) => ({
      created_at: s.created_at,
      value: 1,
    }))
  )

  return { revenue, customers, plans, support, aiCosts, profit, platform, charts }
}

export type PurchaseListParams = {
  search?: string
  status?: string
  from?: string
  to?: string
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  page?: number
  pageSize?: number
}

export type PurchaseListResult = {
  rows: (Purchase & { profiles?: { name: string | null; email: string | null } | null })[]
  total: number
  page: number
  pageSize: number
  counts: {
    captured: number
    failed: number
    refunded: number
    unclaimed: number
  }
}

export async function listPurchases(params: PurchaseListParams): Promise<PurchaseListResult> {
  const admin = createAdminClient()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = admin
    .from('purchases')
    .select('*, profiles:user_id(name, email)', { count: 'exact' })

  if (params.status === 'unclaimed') {
    query = query.eq('status', 'captured').is('claimed_at', null)
  } else if (params.status === 'captured') {
    query = query.eq('status', 'captured').not('claimed_at', 'is', null)
  } else if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status)
  }
  if (params.from) {
    query = query.gte('created_at', params.from)
  }
  if (params.to) {
    query = query.lte('created_at', `${params.to}T23:59:59.999Z`)
  }
  if (params.search?.trim()) {
    const q = params.search.trim()
    query = query.or(
      `customer_email.ilike.%${q}%,customer_name.ilike.%${q}%,plan_name.ilike.%${q}%,razorpay_order_id.ilike.%${q}%,razorpay_payment_id.ilike.%${q}%`
    )
  }

  switch (params.sort) {
    case 'date_asc':
      query = query.order('created_at', { ascending: true })
      break
    case 'amount_desc':
      query = query.order('amount_paise', { ascending: false })
      break
    case 'amount_asc':
      query = query.order('amount_paise', { ascending: true })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  const { data, error, count } = await query.range(from, to)
  const [captured, failed, refunded, unclaimed] = await Promise.all([
    admin
      .from('purchases')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'captured')
      .not('claimed_at', 'is', null),
    admin.from('purchases').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin.from('purchases').select('id', { count: 'exact', head: true }).eq('status', 'refunded'),
    admin
      .from('purchases')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'captured')
      .is('claimed_at', null),
  ])
  const counts = {
    captured: captured.count ?? 0,
    failed: failed.count ?? 0,
    refunded: refunded.count ?? 0,
    unclaimed: unclaimed.count ?? 0,
  }
  if (error) {
    return { rows: [], total: 0, page, pageSize, counts }
  }

  return {
    rows: (data ?? []) as PurchaseListResult['rows'],
    total: count ?? 0,
    page,
    pageSize,
    counts,
  }
}
