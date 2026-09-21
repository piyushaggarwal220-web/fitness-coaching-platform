/**
 * Executive presentation for the Jarvis Command Center.
 * Deterministic — no LLM, no invented values. UI must render this as-is.
 * Does not recalculate LURVOX / Meta / Shopify metrics — only formats pulse output.
 */

import { BUSINESS_TIMEZONE } from '@/lib/time/business-calendar'
import type { PulseMetricCell } from '@/lib/jarvis/operator-pulse'
import type { SystemHealth } from '@/lib/jarvis/operator-integrations'
import { formatInr, relativeTime, taskStatusLabel } from '@/lib/jarvis/operator-present'
import { operatorTimelineStateForIdleActivity } from '@/lib/jarvis/reasoning/boundaries'

export type CockpitMetricStatus = 'ok' | 'zero' | 'unavailable' | 'stale' | 'error'

export type CockpitMetric = {
  id: string
  label: string
  display: string
  value: number | null
  change_pct: number | null
  change_label: string | null
  period: string
  status: CockpitMetricStatus
  status_label: string
  source: 'LURVOX' | 'META' | 'SHOPIFY'
  hint: string
  view: 'revenue' | 'marketing' | 'integrations'
}

export type ChangeCard = {
  id: string
  tone: 'up' | 'down' | 'warn' | 'ok' | 'info'
  title: string
  why: string
  source: string
  impact: string
}

export type AttentionCategory =
  | 'APPROVAL'
  | 'INCIDENT'
  | 'WARNING'
  | 'DECISION'
  | 'BLOCKED'
  | 'DATA GAP'

export type AttentionItem = {
  id: string
  category: AttentionCategory
  title: string
  detail: string
  action: 'review' | 'diagnostics' | 'integrations' | 'none'
  approval_id?: string
}

export type CockpitRecommendation = {
  id: string
  title: string
  problem: string
  evidence: string
  recommendation: string
  impact: string
  risk: string
  action_type: string
  approval_required: boolean
}

export type SparkPoint = { date: string; value: number }

export type OperatorState =
  | 'Observing'
  | 'Analyzing'
  | 'Investigating'
  | 'Recommending'
  | 'Waiting for approval'
  | 'Acting'
  | 'Verifying'
  | 'Completed'
  | 'Blocked'
  | 'Failed'
  | 'Idle'

export type ActiveWork = {
  state: OperatorState
  title: string
  detail: string
  task_id?: string
  steps: { id: string; label: string; state: 'pending' | 'active' | 'done' }[]
  next_step: string
}

export type OperatorEvent = {
  id: string
  state: OperatorState
  title: string
  at: string | null
  detail: string
}

export type CockpitPresentation = {
  greeting: string
  date_label: string
  timezone: string
  brief: string
  early_day: boolean
  insight: { text: string; sources: { label: string; detail: string }[]; evidence_line: string }
  metrics: CockpitMetric[]
  changes: ChangeCard[]
  attention: AttentionItem[]
  recommendations: CockpitRecommendation[]
  charts: {
    revenue_7d: SparkPoint[]
    sales_7d: SparkPoint[]
    ads_7d: SparkPoint[] | null
    meta_unavailable: string | null
  }
  by_plan: { label: string; plan_slug: string; gross_inr: number; paid_count: number }[]
  health: {
    label: string
    explanation: string
    level: SystemHealth['level']
    connected_count: number
    total_count: number
    attention_count: number
    connected_line: string
  }
  active_work: ActiveWork
  operator_timeline: OperatorEvent[]
  freshness: {
    refreshed_at: string
    label: string
    stale: boolean
  }
}

export type CockpitPulse = {
  as_of?: string
  today?: {
    revenue?: PulseMetricCell
    orders?: PulseMetricCell
    aov?: PulseMetricCell
    ad_spend?: PulseMetricCell
    purchases?: PulseMetricCell
    cpa?: PulseMetricCell
    roas?: PulseMetricCell
  }
  yesterday?: {
    revenue?: PulseMetricCell
    orders?: PulseMetricCell
  }
  series?: {
    revenue_7d?: SparkPoint[]
    sales_7d?: SparkPoint[]
    ads_7d?: (SparkPoint & { purchases?: number })[] | null
  }
  by_plan?: { plan_slug: string; gross_inr: number; paid_count: number }[]
  funnel_health?: {
    funnel_id: string | null
    funnel_name: string
    price_inr?: number | null
    spend: PulseMetricCell
    purchases: PulseMetricCell
    cpa: PulseMetricCell
    roas: PulseMetricCell
    target_cpa?: number | null
    max_acceptable_cpa?: number | null
    target_roas?: number | null
    available: boolean
  }[]
  shopify?: {
    connected?: boolean
    orders?: number | null
    revenue?: number | null
    unavailable_reason?: string
    data_status?: string
  }
  note?: string
}

export type CockpitIncident = {
  id: string
  title?: string | null
  symptom?: string | null
  status?: string | null
}

export function istHour(now: Date = new Date()): number {
  const part = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .find((p) => p.type === 'hour')
  return Number(part?.value ?? 0)
}

export function isEarlyBusinessDay(now: Date = new Date()): boolean {
  return istHour(now) < 10
}

export function greetingAt(now: Date = new Date()): string {
  const hour = istHour(now)
  if (hour >= 5 && hour < 12) return "Good morning. Here's what matters today."
  if (hour >= 12 && hour < 17) return "Good afternoon. Here's what matters today."
  if (hour >= 17 && hour < 22) return "Good evening. Here's what matters today."
  return "Here's what matters."
}

export function formatIstDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
}

export function formatIstShort(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(now)
}

export function planLabel(slug: string): string {
  const s = (slug || '').toLowerCase()
  if (!s || s === 'unknown') return 'Unlabeled plan'
  if (s.includes('1699') || s.includes('1,699')) return '₹1,699 product'
  if (/(^|[^0-9])99([^0-9]|$)/.test(s)) return '₹99 product'
  return slug.replace(/[_-]+/g, ' ').trim() || 'Unlabeled plan'
}

/**
 * Exact plan mix from public.purchases by_plan. No causal language.
 * Returns null when breakdown is missing or inconsistent with paid sales total.
 */
export function planMixSentence(
  plans: { plan_slug: string; paid_count: number }[],
  totalPaid: number | null | undefined
): string | null {
  if (totalPaid == null || !Number.isFinite(totalPaid) || totalPaid <= 0) return null
  if (!Array.isArray(plans) || plans.length === 0) return null
  const ranked = [...plans]
    .filter((p) => p && typeof p.paid_count === 'number' && p.paid_count > 0 && p.plan_slug)
    .sort((a, b) => b.paid_count - a.paid_count || a.plan_slug.localeCompare(b.plan_slug))
  const top = ranked[0]
  if (!top) return null
  const total = Math.round(totalPaid)
  if (top.paid_count > total) return null
  return `${planLabel(top.plan_slug)} accounted for ${Math.round(top.paid_count)} of ${total} paid sales today.`
}

export function changeVsYesterday(
  today: number | null | undefined,
  yesterday: number | null | undefined
): { pct: number | null; label: string | null; direction: 'up' | 'down' | 'flat' | null } {
  if (today == null || yesterday == null || Number.isNaN(today) || Number.isNaN(yesterday)) {
    return { pct: null, label: null, direction: null }
  }
  if (yesterday === 0) {
    if (today === 0) return { pct: null, label: 'unchanged vs yesterday', direction: 'flat' }
    return { pct: null, label: 'vs ₹0 yesterday', direction: 'up' }
  }
  const pct = ((today - yesterday) / yesterday) * 100
  if (Math.abs(pct) < 0.5) return { pct: 0, label: 'unchanged vs yesterday', direction: 'flat' }
  const sign = pct > 0 ? '+' : ''
  return {
    pct,
    label: `${sign}${pct.toFixed(1)}% vs yesterday`,
    direction: pct > 0 ? 'up' : 'down',
  }
}

export function executiveChangeLabel(input: {
  today: number | null | undefined
  yesterday: number | null | undefined
  yesterdayOk: boolean
  early: boolean
  kind: 'inr' | 'number'
}): { pct: number | null; label: string | null; direction: 'up' | 'down' | 'flat' | null } {
  const raw = changeVsYesterday(input.today, input.yesterday)
  const collapse = input.today === 0 && (input.yesterday ?? 0) > 0
  if (input.early || collapse) {
    if (!input.yesterdayOk || input.yesterday == null) return { pct: null, label: null, direction: null }
    const yesterdayText =
      input.kind === 'inr'
        ? `${formatInr(input.yesterday)} yesterday`
        : `${Math.round(input.yesterday)} ${Math.round(input.yesterday) === 1 ? 'sale' : 'sales'} yesterday`
    return { pct: null, label: yesterdayText, direction: null }
  }
  return raw
}

function metricStatus(cell?: PulseMetricCell | null): CockpitMetricStatus {
  if (!cell) return 'unavailable'
  if (cell.status === 'error') return 'error'
  if (cell.data_status === 'stale') return 'stale'
  if (cell.status === 'not_connected' || cell.status === 'no_data' || cell.value == null) return 'unavailable'
  if (cell.value === 0) return 'zero'
  return 'ok'
}

function statusLabel(status: CockpitMetricStatus, dataStatus?: string): string {
  if (status === 'error') return 'Failed'
  if (status === 'stale') return 'Stale'
  if (status === 'unavailable') return 'Unavailable'
  if (dataStatus === 'partial') return 'Partial'
  if (dataStatus === 'verified' || status === 'ok' || status === 'zero') return 'Verified'
  return 'Verified'
}

function metricDisplay(cell: PulseMetricCell | undefined, kind: 'inr' | 'number' | 'ratio'): string {
  const status = metricStatus(cell)
  if (status === 'error') return 'Failed'
  if (status === 'unavailable') return 'Unavailable'
  if (status === 'stale') return 'Stale'
  if (kind === 'ratio') return cell?.value == null ? 'Unavailable' : `${Number(cell.value).toFixed(1)}x`
  if (kind === 'number') return cell?.value == null ? 'Unavailable' : String(Math.round(cell.value))
  if (cell?.value == null) return 'Unavailable'
  return `₹${Math.round(cell.value).toLocaleString('en-IN')}`
}

function workFromTask(task?: { id?: string; objective?: string; status?: string } | null): ActiveWork {
  const steps = (
    observe: 'pending' | 'active' | 'done',
    analyze: 'pending' | 'active' | 'done',
    investigate: 'pending' | 'active' | 'done',
    recommend: 'pending' | 'active' | 'done'
  ) => [
    { id: 'observe', label: 'Observing', state: observe },
    { id: 'analyze', label: 'Analyzing', state: analyze },
    { id: 'investigate', label: 'Investigating', state: investigate },
    { id: 'recommend', label: 'Recommending', state: recommend },
  ]

  if (!task?.status) {
    return {
      state: 'Idle',
      title: 'Jarvis is idle.',
      detail: 'No active task.',
      steps: steps('pending', 'pending', 'pending', 'pending'),
      next_step: 'Ask Jarvis a question or wait for the next background cycle.',
    }
  }
  const status = String(task.status)
  const objective = task.objective || 'Working'

  if (status === 'failed' || status === 'budget_exhausted') {
    return {
      state: status === 'budget_exhausted' ? 'Blocked' : 'Failed',
      title: objective,
      detail: taskStatusLabel(status),
      task_id: task.id,
      steps: steps('done', 'done', 'done', 'pending'),
      next_step: status === 'budget_exhausted' ? 'Daily AI budget is paused.' : 'Review the failed task.',
    }
  }
  if (status === 'awaiting_approval') {
    return {
      state: 'Waiting for approval',
      title: objective,
      detail: 'Jarvis is waiting for your decision.',
      task_id: task.id,
      steps: steps('done', 'done', 'done', 'active'),
      next_step: 'Review the pending approval.',
    }
  }
  if (status === 'running') {
    return {
      state: 'Investigating',
      title: objective,
      detail: 'Jarvis is working through this now.',
      task_id: task.id,
      steps: steps('done', 'done', 'active', 'pending'),
      next_step: 'Checking connected sources.',
    }
  }
  if (status === 'queued') {
    return {
      state: 'Analyzing',
      title: objective,
      detail: 'Queued.',
      task_id: task.id,
      steps: steps('active', 'pending', 'pending', 'pending'),
      next_step: 'Starting the next check.',
    }
  }
  if (status === 'completed') {
    return {
      state: 'Completed',
      title: objective,
      detail: 'Last completed task.',
      task_id: task.id,
      steps: steps('done', 'done', 'done', 'done'),
      next_step: 'No active work.',
    }
  }
  return {
    state: 'Observing',
    title: objective,
    detail: taskStatusLabel(status),
    task_id: task.id,
    steps: steps('active', 'pending', 'pending', 'pending'),
    next_step: 'Watching connected systems.',
  }
}

function operatorStateFromKind(kind?: string): OperatorState {
  switch (kind) {
    case 'ANALYSIS':
      return 'Analyzing'
    case 'RESEARCH':
      return 'Investigating'
    case 'ACTION':
      return 'Acting'
    case 'APPROVAL':
      return 'Waiting for approval'
    case 'ERROR':
      return 'Failed'
    default:
      return 'Observing'
  }
}

export function presentCockpit(input: {
  pulse: CockpitPulse | null | undefined
  health?: SystemHealth | null
  approvals?: { id: string; action_label: string; reason: string; risk_level?: string }[]
  incidents?: CockpitIncident[]
  tasks?: { id?: string; objective?: string; status?: string; created_at?: string; completed_at?: string }[]
  activity?: { id: string; at: string; kind: string; title: string; detail?: string }[]
  now?: Date
  refreshed_at?: string
}): CockpitPresentation {
  const now = input.now ?? new Date()
  const early = isEarlyBusinessDay(now)
  const pulse = input.pulse ?? {}
  const today = pulse.today ?? {}
  const yesterday = pulse.yesterday ?? {}
  const health = input.health
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const yesterdayRevenueOk = yesterday.revenue?.status === 'ok'
  const yesterdayOrdersOk = yesterday.orders?.status === 'ok'
  const revenueChange = executiveChangeLabel({
    today: today.revenue?.value,
    yesterday: yesterday.revenue?.value,
    yesterdayOk: yesterdayRevenueOk,
    early,
    kind: 'inr',
  })
  const salesChange = executiveChangeLabel({
    today: today.orders?.value,
    yesterday: yesterday.orders?.value,
    yesterdayOk: yesterdayOrdersOk,
    early,
    kind: 'number',
  })
  const aovYesterday =
    yesterday.revenue?.value != null && yesterday.orders?.value && yesterday.orders.value > 0
      ? yesterday.revenue.value / yesterday.orders.value
      : null
  const aovStatus = metricStatus(today.aov)
  const aovChange =
    aovStatus === 'unavailable' || aovStatus === 'error'
      ? { pct: null, label: null, direction: null }
      : executiveChangeLabel({
          today: today.aov?.value ?? null,
          yesterday: aovYesterday,
          yesterdayOk: yesterdayRevenueOk && yesterdayOrdersOk && aovYesterday != null,
          early,
          kind: 'inr',
        })

  function metric(
    id: string,
    label: string,
    cell: PulseMetricCell | undefined,
    kind: 'inr' | 'number' | 'ratio',
    source: 'LURVOX' | 'META',
    view: CockpitMetric['view'],
    change: { pct: number | null; label: string | null },
    fallbackHint: string
  ): CockpitMetric {
    const status = metricStatus(cell)
    const metaEmpty = source === 'META' && (status === 'unavailable' || status === 'error')
    return {
      id,
      label,
      display: metricDisplay(cell, kind),
      value: status === 'ok' || status === 'zero' ? cell?.value ?? null : null,
      change_pct: change.pct,
      change_label: metaEmpty ? 'No Meta data' : change.label,
      period: source === 'LURVOX' ? 'Today · IST' : 'Today',
      status,
      status_label: statusLabel(status, cell?.data_status),
      source,
      hint: cell?.hint || fallbackHint,
      view,
    }
  }

  const metrics: CockpitMetric[] = [
    metric('revenue', 'Revenue', today.revenue, 'inr', 'LURVOX', 'revenue', revenueChange, 'LURVOX paid purchases.'),
    metric('sales', 'Paid sales', today.orders, 'number', 'LURVOX', 'revenue', salesChange, 'Captured paid purchases.'),
    metric('aov', 'AOV', today.aov, 'inr', 'LURVOX', 'revenue', aovChange, 'Gross paid revenue ÷ paid sales.'),
    metric('ad_spend', 'Ad spend', today.ad_spend, 'inr', 'META', 'marketing', { pct: null, label: null }, 'Meta ad spend. Not revenue.'),
    metric('cpa', 'CPA', today.cpa, 'inr', 'META', 'marketing', { pct: null, label: null }, 'Meta cost per purchase.'),
    metric('roas', 'ROAS', today.roas, 'ratio', 'META', 'marketing', { pct: null, label: null }, 'Meta initial ROAS. Not LURVOX cash.'),
  ]

  const plans = pulse.by_plan ?? []
  const openIncidents = (input.incidents ?? []).filter(
    (i) => i.status && !['resolved', 'wont_fix'].includes(String(i.status))
  )
  const pendingApprovals = input.approvals ?? []
  const todayRevenueOk = today.revenue?.status === 'ok'
  const todayOrdersOk = today.orders?.status === 'ok'
  const todayZero = todayRevenueOk && (today.revenue?.value ?? 0) === 0
  const metaUnavailable =
    today.ad_spend?.status === 'no_data' ||
    today.ad_spend?.status === 'not_connected' ||
    today.ad_spend?.status === 'error'

  const briefParts: string[] = []
  if (todayRevenueOk && todayOrdersOk && (early || todayZero) && yesterdayRevenueOk && yesterdayOrdersOk) {
    briefParts.push(
      `Yesterday LURVOX collected ${formatInr(yesterday.revenue?.value)} from ${Math.round(yesterday.orders?.value ?? 0)} paid sales.`
    )
    briefParts.push(
      early
        ? `Today has started with ${formatInr(today.revenue?.value)} in sales.`
        : `Today LURVOX has ${formatInr(today.revenue?.value)} from ${Math.round(today.orders?.value ?? 0)} paid sales.`
    )
  } else if (todayRevenueOk && todayOrdersOk) {
    briefParts.push(
      `Revenue is ${formatInr(today.revenue?.value)} from ${Math.round(today.orders?.value ?? 0)} paid sales today.`
    )
  } else if (today.revenue?.status === 'error') {
    briefParts.push('LURVOX paid revenue could not be retrieved.')
  } else if (yesterdayRevenueOk && yesterdayOrdersOk) {
    briefParts.push(
      `Yesterday LURVOX collected ${formatInr(yesterday.revenue?.value)} from ${Math.round(yesterday.orders?.value ?? 0)} paid sales. Today's LURVOX revenue is unavailable.`
    )
  } else {
    briefParts.push('LURVOX paid revenue is unavailable.')
  }
  const mix = planMixSentence(plans, todayOrdersOk ? today.orders?.value ?? null : null)
  if (mix) {
    briefParts.push(mix)
  }
  if (today.ad_spend?.status === 'not_connected') {
    briefParts.push('Meta Ads is not connected.')
  } else if (today.ad_spend?.status === 'no_data' || today.ad_spend?.status === 'error') {
    briefParts.push('Meta performance data is currently unavailable.')
  } else if (today.ad_spend?.status === 'ok') {
    briefParts.push(`Meta ad spend is ${formatInr(today.ad_spend.value)}.`)
  }
  if (openIncidents.length) {
    briefParts.push(
      `${openIncidents.length} diagnostic ${openIncidents.length === 1 ? 'incident needs' : 'incidents need'} attention.`
    )
  }

  const insightSources: { label: string; detail: string }[] = []
  let insightText = ''
  let evidenceLine = ''

  if (metaUnavailable) {
    insightText =
      'Meta analysis is currently blocked because no verified marketing_performance rows are available.'
    insightSources.push({
      label: 'META',
      detail:
        today.ad_spend?.status === 'not_connected'
          ? 'Meta Ads is not connected.'
          : today.ad_spend?.hint || 'No verified marketing_performance rows.',
    })
    evidenceLine = 'marketing_performance · today · Meta'
  } else if (today.revenue?.status === 'error') {
    insightText = 'LURVOX paid revenue could not be retrieved. This is not ₹0.'
    insightSources.push({
      label: 'LURVOX',
      detail: today.revenue.hint || 'public.purchases query failed.',
    })
    evidenceLine = `LURVOX purchases · ${formatIstShort(now)} · IST`
  } else if (todayRevenueOk && todayOrdersOk && (today.orders?.value ?? 0) > 0) {
    insightText = `Today's ${Math.round(today.orders?.value ?? 0)} sales generated ${formatInr(today.revenue?.value)}.`
    const mixInsight = planMixSentence(plans, today.orders?.value ?? null)
    if (mixInsight) {
      insightText += ` ${mixInsight}`
    }
    insightSources.push({
      label: 'LURVOX',
      detail: today.revenue?.hint || 'Paid purchases in public.purchases, Asia/Kolkata.',
    })
    evidenceLine = `LURVOX purchases · ${formatIstShort(now)} · IST`
  } else if ((early || todayZero) && yesterdayOrdersOk && yesterdayRevenueOk) {
    insightText = `Yesterday LURVOX collected ${formatInr(yesterday.revenue?.value)} from ${Math.round(yesterday.orders?.value ?? 0)} paid sales. Today has started with ${formatInr(today.revenue?.value)}.`
    insightSources.push({
      label: 'LURVOX',
      detail: yesterday.revenue?.hint || 'Paid purchases in public.purchases, Asia/Kolkata.',
    })
    evidenceLine = `LURVOX purchases · ${formatIstShort(yesterdayDate)} · IST`
  } else {
    insightText = 'Connected sources did not produce a complete LURVOX picture yet.'
    insightSources.push({
      label: 'LURVOX',
      detail: today.revenue?.hint || yesterday.revenue?.hint || 'Paid purchases in public.purchases, Asia/Kolkata.',
    })
    evidenceLine = `LURVOX purchases · ${formatIstShort(now)} · IST`
  }

  const rawPct = changeVsYesterday(today.revenue?.value, yesterday.revenue?.value)
  const changes: ChangeCard[] = []
  if ((early || todayZero) && yesterdayRevenueOk && yesterdayOrdersOk) {
    changes.push({
      id: 'revenue-yesterday',
      tone: 'info',
      title: 'Yesterday',
      why: `${formatInr(yesterday.revenue?.value)} from ${Math.round(yesterday.orders?.value ?? 0)} paid LURVOX sales`,
      source: 'LURVOX',
      impact: 'Verified captured purchases · Asia/Kolkata.',
    })
    if (todayRevenueOk && todayOrdersOk) {
      changes.push({
        id: 'revenue-today',
        tone: 'info',
        title: 'Today',
        why: `Started at ${formatInr(today.revenue?.value)} / ${Math.round(today.orders?.value ?? 0)} paid sales`,
        source: 'LURVOX',
        impact: early ? 'Early in the IST business day — not a collapse signal.' : 'Verified zero so far today.',
      })
    }
  } else if (todayRevenueOk && yesterdayRevenueOk && (rawPct.direction === 'up' || rawPct.direction === 'down')) {
    changes.push({
      id: 'revenue',
      tone: rawPct.direction,
      title: rawPct.direction === 'up' ? 'Revenue increased' : 'Revenue decreased',
      why: `${formatInr(today.revenue?.value)} today vs ${formatInr(yesterday.revenue?.value)} yesterday.`,
      source: 'LURVOX',
      impact: rawPct.label || 'Day-over-day paid revenue.',
    })
  }
  if (!early && !todayZero && todayOrdersOk && yesterdayOrdersOk) {
    const salesRaw = changeVsYesterday(today.orders?.value, yesterday.orders?.value)
    if (salesRaw.direction === 'up' || salesRaw.direction === 'down') {
      const delta = Math.round((today.orders?.value ?? 0) - (yesterday.orders?.value ?? 0))
      const sign = delta > 0 ? '+' : ''
      changes.push({
        id: 'sales',
        tone: salesRaw.direction,
        title: 'Sales',
        why: `${sign}${delta} paid sales vs yesterday.`,
        source: 'LURVOX',
        impact: `${Math.round(today.orders?.value ?? 0)} today · ${Math.round(yesterday.orders?.value ?? 0)} yesterday.`,
      })
    }
  }
  if (metaUnavailable) {
    changes.push({
      id: 'meta-gap',
      tone: 'warn',
      title: 'Meta',
      why: 'Performance is unavailable',
      source: 'META',
      impact:
        today.ad_spend?.status === 'not_connected'
          ? 'Meta Ads is not connected.'
          : today.ad_spend?.status === 'error'
            ? 'Meta performance could not be retrieved.'
            : 'No verified marketing_performance rows.',
    })
  }
  if (today.revenue?.status === 'error') {
    changes.push({
      id: 'lurvox-fail',
      tone: 'warn',
      title: 'LURVOX',
      why: 'Failed',
      source: 'LURVOX',
      impact: today.revenue.hint || 'Paid revenue could not be retrieved. This is not ₹0.',
    })
  }

  const attention: AttentionItem[] = []
  if (openIncidents.length) {
    attention.push({
      id: 'incidents',
      category: 'INCIDENT',
      title: `${openIncidents.length} diagnostic ${openIncidents.length === 1 ? 'incident needs' : 'incidents need'} attention`,
      detail: openIncidents
        .slice(0, 3)
        .map((inc) => inc.title || inc.symptom || String(inc.status || 'open'))
        .filter(Boolean)
        .join(' · '),
      action: 'diagnostics',
    })
  }
  if (pendingApprovals.length) {
    attention.push({
      id: 'approvals',
      category: 'APPROVAL',
      title: `${pendingApprovals.length} ${pendingApprovals.length === 1 ? 'approval waiting' : 'approvals waiting'}`,
      detail: `${pendingApprovals.length} ${pendingApprovals.length === 1 ? 'action requires' : 'actions require'} your approval.`,
      action: 'review',
      approval_id: pendingApprovals[0]?.id,
    })
  }
  if (today.revenue?.status === 'error') {
    attention.push({
      id: 'lurvox-error',
      category: 'WARNING',
      title: 'LURVOX revenue unavailable',
      detail: today.revenue.hint || 'Could not retrieve paid purchases.',
      action: 'diagnostics',
    })
  }
  if (health?.level === 'action_required') {
    attention.push({
      id: 'health',
      category: 'BLOCKED',
      title: 'Core systems need attention',
      detail: health.explanation,
      action: 'integrations',
    })
  }

  const recommendations: CockpitRecommendation[] = []
  for (const f of pulse.funnel_health ?? []) {
    if (!f.available || f.cpa.status !== 'ok' || f.cpa.value == null) continue
    const max = f.max_acceptable_cpa
    if (max != null && f.cpa.value > max) {
      recommendations.push({
        id: `cpa-${f.funnel_id || f.funnel_name}`,
        title: `Review ${f.funnel_name} CPA`,
        problem: `${f.funnel_name} CPA is above its max acceptable CPA.`,
        evidence: `CPA ${formatInr(f.cpa.value)} vs max acceptable ${formatInr(max)} today. Spend ${f.spend.display}.`,
        recommendation: 'Do not raise budget until CPA is back under target. Review creative and audience first.',
        impact: 'Avoids spending more at an unprofitable CPA.',
        risk: 'Medium',
        action_type: 'Review',
        approval_required: true,
      })
    }
  }
  if (!recommendations.length && (today.ad_spend?.status === 'no_data' || today.ad_spend?.status === 'error')) {
    recommendations.push({
      id: 'investigate-meta',
      title: 'Investigate Meta performance before changing ad budgets.',
      problem: 'Meta performance rows are currently unavailable.',
      evidence: 'marketing_performance · last 7 days',
      recommendation: 'Do not change spend until Meta data is verified.',
      impact: 'Prevents budget decisions without attribution.',
      risk: 'No spend change proposed.',
      action_type: 'Investigate',
      approval_required: false,
    })
  }

  const running = (input.tasks ?? []).find((t) =>
    ['running', 'queued', 'awaiting_approval'].includes(String(t.status))
  )
  const lastCompleted = (input.tasks ?? []).find((t) => t.status === 'completed')
  const active_work = running
    ? workFromTask(running)
    : lastCompleted
      ? {
          ...workFromTask(null),
          state: 'Idle' as const,
          title: 'Jarvis is idle.',
          detail: lastCompleted.objective
            ? `Last completed: ${lastCompleted.objective}`
            : 'Last completed task recently.',
          steps: [
            { id: 'observe', label: 'Observing', state: 'done' as const },
            { id: 'analyze', label: 'Analyzing', state: 'done' as const },
            { id: 'investigate', label: 'Investigating', state: 'done' as const },
            { id: 'recommend', label: 'Recommending', state: 'done' as const },
          ],
          next_step: 'No active work.',
        }
      : workFromTask(null)

  const operator_timeline: OperatorEvent[] = []
  for (const item of (input.activity ?? []).slice(0, 4)) {
    operator_timeline.push({
      id: item.id,
      state: running
        ? operatorStateFromKind(item.kind)
        : (operatorTimelineStateForIdleActivity(item.kind) as OperatorState),
      title: item.title,
      at: item.at,
      detail: item.detail || '',
    })
  }
  if (metaUnavailable && !operator_timeline.some((e) => e.state === 'Waiting for approval' || e.id === 'meta-wait')) {
    operator_timeline.push({
      id: 'meta-wait',
      state: 'Blocked',
      title: 'Meta performance unavailable',
      at: null,
      detail: 'Needs integration attention',
    })
  }
  if (!operator_timeline.length) {
    operator_timeline.push({
      id: 'idle',
      state: 'Idle',
      title: active_work.title,
      at: lastCompleted?.completed_at || lastCompleted?.created_at || null,
      detail: active_work.detail,
    })
  }

  const adsSeries = pulse.series?.ads_7d ?? null
  const metaChartEmpty = !adsSeries || adsSeries.length === 0
  const connected = health?.connected_count ?? 0
  const total = health?.total_count ?? 0
  const need = health?.attention_count ?? 0

  const refreshedAt = input.refreshed_at || now.toISOString()
  const staleSources = [today.revenue, today.orders, today.aov, today.ad_spend, today.cpa, today.roas].some(
    (cell) => cell?.data_status === 'stale'
  )
  const freshnessLabel = staleSources
    ? `Updated ${relativeTime(refreshedAt) || 'just now'} · Some data may be stale`
    : `Updated ${relativeTime(refreshedAt) || 'just now'}`

  return {
    greeting: greetingAt(now),
    date_label: formatIstDate(now),
    timezone: BUSINESS_TIMEZONE,
    brief: briefParts.join(' '),
    early_day: early,
    insight: {
      text: insightText,
      sources: insightSources,
      evidence_line: evidenceLine,
    },
    metrics,
    changes: changes.slice(0, 3),
    attention,
    recommendations,
    charts: {
      revenue_7d: pulse.series?.revenue_7d ?? [],
      sales_7d: pulse.series?.sales_7d ?? [],
      ads_7d: metaChartEmpty ? null : adsSeries,
      meta_unavailable: metaChartEmpty
        ? 'No verified marketing_performance rows for this period.'
        : null,
    },
    by_plan: plans.map((p) => ({
      label: planLabel(p.plan_slug),
      plan_slug: p.plan_slug,
      gross_inr: p.gross_inr,
      paid_count: p.paid_count,
    })),
    health: {
      label: health?.label || 'Operational',
      explanation: health?.explanation || 'Checking systems…',
      level: health?.level || 'operational',
      connected_count: connected,
      total_count: total,
      attention_count: need,
      connected_line:
        total > 0
          ? `${connected} connected${need ? ` · ${need} need attention` : ''}`
          : 'Checking systems…',
    },
    active_work,
    operator_timeline,
    freshness: {
      refreshed_at: refreshedAt,
      label: freshnessLabel,
      stale: staleSources,
    },
  }
}

export function looksLikeRawPayload(text: string | null | undefined): boolean {
  if (!text) return false
  const t = text.trim()
  return t.startsWith('{') || t.startsWith('[') || t.includes('"tool"') || t.includes('GraphQL')
}
