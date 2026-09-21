import {
  getShopifyCredentials,
  isShopifyConfigured,
  shopifyGetOrders,
  shopifyGraphql,
  shopifyOrderStats,
  shopifyTodayCommerce,
  shopifyTodayQueryWindow,
} from '@/lib/jarvis/shopify/client'
import { executeSafeToolTest, inspectToolOutputContract } from './tool-contract-tester'
import { calendarDayWindow, timezoneMismatchRisk, utcMidnightWindow } from './timezone'
import { BUSINESS_TIMEZONE } from './provenance'
import { redactDiagnosticText, redactDiagnosticValue } from './redact'
import type {
  DataStatus,
  DiagnosticEvidence,
  DiagnosticFinding,
  ProposedRemediation,
  RootCauseResult,
} from './diagnostic-types'
import { evaluateRemediationPermission } from './safe-debugger'

function evidence(
  system: string,
  observation: string,
  payload?: unknown,
  data_status?: DataStatus
): DiagnosticEvidence {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    stage: 'investigate',
    system,
    observation,
    data_status,
    payload: payload == null ? undefined : redactDiagnosticValue(payload),
    at: new Date().toISOString(),
  }
}

export type PipelineTrace = {
  evidence: DiagnosticEvidence[]
  findings: DiagnosticFinding[]
  remediations: ProposedRemediation[]
  root: RootCauseResult
}

function finding(
  id: string,
  title: string,
  severity: DiagnosticFinding['severity'],
  system: string,
  detail: string,
  data_status?: DataStatus
): DiagnosticFinding {
  return { id, title, severity, system, detail, data_status }
}

export async function investigateShopifyRevenuePipeline(problem: string): Promise<PipelineTrace> {
  const evidenceList: DiagnosticEvidence[] = []
  const findings: DiagnosticFinding[] = []
  const remediations: ProposedRemediation[] = []
  const now = new Date()

  evidenceList.push(
    evidence('orchestrator', 'User symptom captured for Shopify revenue pipeline.', { problem })
  )

  if (!isShopifyConfigured()) {
    findings.push(
      finding(
        'shopify_unconfigured',
        'Shopify is not configured',
        'high',
        'shopify',
        'Credentials missing. Revenue cannot be determined. This is not ₹0.',
        'unavailable'
      )
    )
    return finish(evidenceList, findings, remediations, 'unavailable', 'Shopify is not configured.')
  }

  const creds = getShopifyCredentials()
  evidenceList.push(
    evidence('shopify.auth', 'Public Shopify config (no secrets).', creds.ok ? creds : creds, 'verified')
  )

  let shopTimezone = BUSINESS_TIMEZONE
  let shopName: string | null = null
  let graphqlOrdersCount: number | null = null
  let graphqlCountPrecision: string | null = null
  let graphqlErrors: string[] = []
  let restUnfilteredCount: number | null = null
  let restUnfilteredStatus: DataStatus = 'unknown'

  try {
    const shopGql = await shopifyGraphql<{
      shop?: { name?: string; ianaTimezone?: string; currencyCode?: string; myshopifyDomain?: string }
    }>(`query { shop { name ianaTimezone currencyCode myshopifyDomain } }`)
    evidenceList.push(
      evidence(
        'shopify.graphql',
        `Shop identity GraphQL HTTP ${shopGql.http_status}; graphql_ok=${shopGql.graphql_ok}.`,
        {
          http_status: shopGql.http_status,
          graphql_ok: shopGql.graphql_ok,
          errors: shopGql.errors,
          data_status: shopGql.data_status,
          shop: shopGql.data?.shop ?? null,
        },
        shopGql.data_status
      )
    )
    if (!shopGql.graphql_ok) {
      findings.push(
        finding(
          'graphql_identity_errors',
          'Shop identity GraphQL was not a clean success',
          'high',
          'shopify',
          shopGql.errors.map((e) => e.message).join('; ') || `HTTP ${shopGql.http_status}`,
          shopGql.data_status
        )
      )
    }
    shopTimezone = shopGql.data?.shop?.ianaTimezone || shopTimezone
    shopName = shopGql.data?.shop?.name ?? null
  } catch (err) {
    findings.push(
      finding(
        'graphql_identity_failed',
        'Could not read Shopify shop identity',
        'high',
        'shopify',
        redactDiagnosticText(err instanceof Error ? err.message : 'GraphQL failed'),
        'failed'
      )
    )
  }

  try {
    const countGql = await shopifyGraphql<{
      ordersCount?: { count?: number; precision?: string }
    }>(`query { ordersCount { count precision } }`)
    graphqlErrors = countGql.errors.map((e) => e.message)
    evidenceList.push(
      evidence(
        'shopify.graphql',
        'ordersCount probe inspects HTTP status AND GraphQL errors (HTTP 200 is not success by itself).',
        {
          http_status: countGql.http_status,
          graphql_ok: countGql.graphql_ok,
          errors: countGql.errors,
          count: countGql.data?.ordersCount?.count ?? null,
          precision: countGql.data?.ordersCount?.precision ?? null,
          data_status: countGql.data_status,
        },
        countGql.data_status
      )
    )
    if (countGql.graphql_ok) {
      graphqlOrdersCount = countGql.data?.ordersCount?.count ?? null
      graphqlCountPrecision = countGql.data?.ordersCount?.precision ?? null
    } else {
      findings.push(
        finding(
          'graphql_count_failed',
          'ordersCount GraphQL did not succeed',
          'high',
          'shopify',
          graphqlErrors.join('; ') || `HTTP ${countGql.http_status}`,
          countGql.data_status
        )
      )
    }
  } catch (err) {
    findings.push(
      finding(
        'graphql_count_exception',
        'ordersCount request threw',
        'high',
        'shopify',
        redactDiagnosticText(err instanceof Error ? err.message : 'ordersCount failed'),
        'failed'
      )
    )
  }

  try {
    const rest = await shopifyGetOrders({ limit: 50, status: 'any' })
    restUnfilteredCount = rest.length
    restUnfilteredStatus = 'verified'
    evidenceList.push(
      evidence(
        'shopify.rest',
        `REST /orders.json status=any returned ${rest.length} orders (array present; this is not an inferred zero from a failed call).`,
        { count: rest.length, sample_ids: rest.slice(0, 5).map((o) => o.id) },
        'verified'
      )
    )
  } catch (err) {
    restUnfilteredStatus = 'failed'
    restUnfilteredCount = null
    findings.push(
      finding(
        'rest_orders_failed',
        'REST orders list failed',
        'high',
        'shopify',
        redactDiagnosticText(err instanceof Error ? err.message : 'REST failed'),
        'failed'
      )
    )
  }

  const utcToday = utcMidnightWindow(now)
  const pipelineWindow = shopifyTodayQueryWindow(now)
  const istToday = calendarDayWindow(shopTimezone, now, 0)
  const istYesterday = calendarDayWindow(shopTimezone, now, -1)
  const istPrev2Start = calendarDayWindow(shopTimezone, now, -2)
  const tzRisk = timezoneMismatchRisk({
    shopTimezone,
    pipelineTimezone: pipelineWindow.timezone,
  })

  evidenceList.push(
    evidence('shopify.parser', 'Today pipeline window vs shop timezone calendar days.', {
      pipeline: pipelineWindow,
      utc_today: { start: utcToday.start.toISOString(), end: utcToday.end.toISOString() },
      shop_today: { start: istToday.start.toISOString(), end: istToday.end.toISOString(), ymd: istToday.ymd },
      shop_yesterday: {
        start: istYesterday.start.toISOString(),
        end: istYesterday.end.toISOString(),
        ymd: istYesterday.ymd,
      },
      shop_prev_2_calendar_days: {
        start: istPrev2Start.start.toISOString(),
        end: istYesterday.end.toISOString(),
      },
      shop_timezone: shopTimezone,
    })
  )

  if (tzRisk.mismatch) {
    findings.push(
      finding(
        'timezone_mismatch',
        'Today revenue uses UTC midnight, not the shop business timezone',
        'medium',
        'shopify',
        tzRisk.detail,
        'partial'
      )
    )
    remediations.push({
      id: 'use_shop_timezone',
      kind: 'code_change',
      title: 'Query Shopify commerce using the shop IANA timezone calendar day',
      description:
        'shopifyTodayCommerce currently starts at UTC midnight. LURVOX shop timezone is Asia/Kolkata, so IST 00:00–05:30 is the previous UTC day and can be excluded from "today".',
      risk: 'medium',
      permission: evaluateRemediationPermission('code_change'),
      test_plan: [
        'Unit test: IST calendar day must not use UTC midnight.',
        'Shopify read test for today and last 2 IST days.',
        'Jarvis shopify.today_revenue + last-2-days command.',
        'TypeScript --noEmit',
        'Jarvis verification of the original question.',
      ],
      files: ['src/lib/jarvis/shopify/client.ts'],
      current_state: { timezone: pipelineWindow.timezone, start: pipelineWindow.start },
      proposed_state: { timezone: shopTimezone, start: istToday.start.toISOString() },
    })
  }

  remediations.push({
    id: 'period_api_filter',
    kind: 'code_change',
    title: 'Filter Shopify stats by API date range, not last-50 client-side rolling hours',
    description:
      'shopifyOrderStats fetches the last 50 orders with no created_at_min/max, then filters Date.now()-days. That is not an IST calendar-day query and can miss or undercount.',
    risk: 'medium',
    permission: evaluateRemediationPermission('code_change'),
    test_plan: [
      'Unit test: N-day stats provenance includes query_period and timezone.',
      'GraphQL/REST date-window read test.',
      'Jarvis command: last 2 days.',
    ],
    files: ['src/lib/jarvis/shopify/client.ts', 'src/lib/jarvis/tools/builtins.ts'],
  })

  let todayCommerceStatus: DataStatus = 'unknown'
  try {
    const today = await shopifyTodayCommerce()
    todayCommerceStatus = today.data_status
    evidenceList.push(
      evidence(
        'shopify.today_revenue',
        'Jarvis today commerce result with provenance.',
        {
          ok: today.ok,
          connected: today.connected,
          data_status: today.data_status,
          revenue: today.ok ? today.revenue : null,
          orders: today.ok ? today.orders : null,
          timezone: today.provenance?.timezone,
          period: today.provenance?.period,
        },
        today.data_status
      )
    )
    const contract = inspectToolOutputContract({
      tool: 'shopify.today_revenue',
      output: today,
      executed: true,
      inputValid: true,
    })
    evidenceList.push(evidence('tool.contract', contract.summary, contract, contract.data_status))
    for (const a of contract.anomalies) {
      findings.push(
        finding(`today_${a.type}`, a.detail, a.type === 'hidden_failure' ? 'high' : 'medium', 'shopify', a.detail, contract.data_status)
      )
    }
  } catch (err) {
    todayCommerceStatus = 'failed'
    findings.push(
      finding(
        'today_commerce_exception',
        'shopifyTodayCommerce threw',
        'high',
        'shopify',
        redactDiagnosticText(err instanceof Error ? err.message : 'today commerce failed'),
        'failed'
      )
    )
  }

  try {
    const stats = await shopifyOrderStats(2)
    evidenceList.push(
      evidence(
        'shopify.order_stats',
        'Last-2-days stats currently use a rolling 48h window on the last 50 REST orders.',
        stats,
        stats.data_status
      )
    )
    if (stats.data_status === 'failed') {
      findings.push(
        finding(
          'stats_failed',
          'Last-2-days Shopify stats failed',
          'high',
          'shopify',
          stats.error || 'order_stats failed',
          'failed'
        )
      )
    }
  } catch (err) {
    findings.push(
      finding(
        'stats_exception',
        'shopifyOrderStats threw',
        'high',
        'shopify',
        redactDiagnosticText(err instanceof Error ? err.message : 'stats failed'),
        'failed'
      )
    )
  }

  const todayTool = await executeSafeToolTest('shopify.today_revenue', {})
  evidenceList.push(evidence('ai.tool_output', 'Live shopify.today_revenue tool contract.', todayTool, todayTool.data_status))

  const apiEmptyVerified =
    restUnfilteredStatus === 'verified' &&
    restUnfilteredCount === 0 &&
    graphqlOrdersCount === 0

  if (apiEmptyVerified) {
    findings.push(
      finding(
        'admin_api_empty',
        'Connected Shopify Admin API reports zero orders',
        'high',
        'shopify',
        `Shop ${shopName || (creds.ok ? creds.shopDomain : '')} GraphQL ordersCount=${graphqlOrdersCount} precision=${graphqlCountPrecision}. REST list count=${restUnfilteredCount}. This is a verified empty Admin orders dataset, not an API failure converted to ₹0.`,
        'verified'
      )
    )
  }

  const failedSomewhere =
    restUnfilteredStatus === 'failed' ||
    todayCommerceStatus === 'failed' ||
    findings.some((f) => f.data_status === 'failed')

  let summary: string
  let pipelineBreak: string | null = null
  let confidence: RootCauseResult['confidence'] = 'medium'
  let dataStatus: DataStatus = failedSomewhere ? 'failed' : apiEmptyVerified ? 'verified' : todayCommerceStatus

  if (failedSomewhere && !apiEmptyVerified) {
    summary =
      'A Shopify read failed. Jarvis must not conclude revenue is ₹0. The incorrect value entered as a missing/failed payload, not as numeric zero from Shopify.'
    pipelineBreak = 'shopify.api'
    confidence = 'high'
    dataStatus = 'failed'
  } else if (apiEmptyVerified) {
    summary = [
      `Shopify Admin API on the connected shop returned a verified empty orders set (REST ${restUnfilteredCount}, GraphQL ordersCount ${graphqlOrdersCount} ${graphqlCountPrecision || ''}).`,
      tzRisk.mismatch
        ? 'Separately, the Jarvis today window uses UTC midnight while the shop timezone is not UTC, so calendar-day questions can still be wrong even when the unfiltered Admin catalog is empty.'
        : '',
      'If the owner observed sales, they are not present as Admin orders on this shop/token (different shop, channel, or checkout that never created an order).',
    ]
      .filter(Boolean)
      .join(' ')
    pipelineBreak = tzRisk.mismatch ? 'shopify.today_revenue.timezone' : 'shopify.admin_orders.empty'
    confidence = 'high'
  } else {
    summary = 'Shopify pipeline produced data; see findings for window/parser caveats.'
    pipelineBreak = tzRisk.mismatch ? 'shopify.today_revenue.timezone' : null
  }

  return finish(evidenceList, findings, remediations, dataStatus, summary, pipelineBreak, confidence)
}

function finish(
  evidenceList: DiagnosticEvidence[],
  findings: DiagnosticFinding[],
  remediations: ProposedRemediation[],
  data_status: DataStatus,
  summary: string,
  pipeline_break: string | null = null,
  confidence: RootCauseResult['confidence'] = 'medium'
): PipelineTrace {
  const cannot = data_status === 'failed' || data_status === 'unavailable' || data_status === 'unknown'
  return {
    evidence: evidenceList,
    findings,
    remediations,
    root: {
      summary,
      confidence,
      pipeline_break,
      findings,
      cannot_conclude_business: cannot,
    },
  }
}

export function classifyProblem(problem: string): {
  system: string
  kind: 'shopify_revenue' | 'shopify_disconnected' | 'meta_missing' | 'tool_failure' | 'why' | 'generic'
} {
  const q = problem.toLowerCase()
  if (q.includes('shopify') && (q.includes('disconnect') || q.includes('not connected'))) {
    return { system: 'shopify', kind: 'shopify_disconnected' }
  }
  // Meta sync / performance takes priority when Meta is the subject (including lastSync / missing ads).
  if (
    /\bmeta\b/.test(q) &&
    (/\bmissing\b|\bunavailable\b|\bsync\b|\bspend\b|\bcampaign|\bads?\b|\bperformance\b|\blastsync/.test(
      q
    ) ||
      q.includes('marketing_performance'))
  ) {
    return { system: 'meta', kind: 'meta_missing' }
  }
  // Shopify revenue pipeline only when Shopify is explicitly named.
  if (
    q.includes('shopify') &&
    (q.includes('revenue') ||
      q.includes('sales') ||
      q.includes('orders') ||
      q.includes('zero') ||
      q.includes('0') ||
      q.includes('wrong') ||
      q.includes('incorrect') ||
      q.includes('last 2') ||
      q.includes('yesterday'))
  ) {
    return { system: 'shopify', kind: 'shopify_revenue' }
  }
  if (q.includes('shopify')) return { system: 'shopify', kind: 'shopify_revenue' }
  if (q.includes('tool fail') || q.includes('why did this tool')) return { system: 'tools', kind: 'tool_failure' }
  if (q.trim().startsWith('why') || q.includes('why ')) return { system: 'jarvis', kind: 'why' }
  return { system: 'jarvis', kind: 'generic' }
}
