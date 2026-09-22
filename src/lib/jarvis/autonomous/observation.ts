/**
 * Unified business observation — composes existing SOTs (no competing revenue math).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getPerformanceByFunnel } from '@/lib/ai-marketing/funnels'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { isInstagramConfigured, liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import { isShopifyConfigured } from '@/lib/jarvis/shopify/client'
import { isVideoProviderConfigured, describeVideoProviderConfig } from '@/lib/jarvis/video/provider'
import { runHealthChecks } from '@/lib/jarvis/diagnostics/health-checks'
import { BUSINESS_TIMEZONE } from '@/lib/time/business-calendar'
import { detectBusinessAnomalies } from '@/lib/jarvis/autonomous/anomalies'
import { computeBusinessHealth, mapIntegrationStatus } from '@/lib/jarvis/autonomous/health'
import { detectOpportunities } from '@/lib/jarvis/autonomous/opportunities'
import type { UnifiedObservation } from '@/lib/jarvis/autonomous/types'

export async function buildUnifiedObservation(opts?: {
  cycleId?: string | null
}): Promise<UnifiedObservation> {
  const observed_at = new Date().toISOString()
  const limitations: string[] = []

  const [
    todayRev,
    yesterdayRev,
    perf,
    meta,
    approvals,
    cost,
    _budgets,
    healthChecks,
  ] = await Promise.all([
    loadLurvoxRevenue({ preset: 'today' }).catch(() => null),
    loadLurvoxRevenue({ preset: 'yesterday' }).catch(() => null),
    getPerformanceByFunnel({ days: 7 }).catch(() => null),
    loadMetaIntegrationStatus().catch(() => null),
    listPendingApprovals(20).catch(() => []),
    getCostDashboard().catch(() => null),
    getJarvisBudgets().catch(() => null),
    runHealthChecks().catch(() => []),
  ])
  void _budgets

  let contentBlocked = 0
  let contentNeedsReview = 0
  let contentScheduled = 0
  let contentSummary: Record<string, unknown> = { loaded: false }
  try {
    const { getContentOpsSummary, getContentQueue } = await import('@/lib/jarvis/content-ops')
    const summary = await getContentOpsSummary()
    const queue = await getContentQueue({ limit: 80 })
    contentBlocked = queue.needs_attention.filter((i) => i.blocking_reason).length
    contentNeedsReview = queue.items.filter(
      (i) => i.status === 'REVIEW' || i.status === 'REVISION_REQUESTED'
    ).length
    contentScheduled = summary.scheduled
    contentSummary = { ...summary, needs_review: contentNeedsReview, blocked: contentBlocked }
  } catch {
    limitations.push('Content ops summary unavailable this cycle.')
  }

  let renderFailures = 0
  let videoInfo: Record<string, unknown> = {
    configured: isVideoProviderConfigured(),
    provider: describeVideoProviderConfig(),
  }
  try {
    const admin = createAdminClient()
    const { count } = await admin
      .from('video_edit_jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['failed', 'error'])
      .gte('created_at', new Date(Date.now() - 48 * 3600_000).toISOString())
    renderFailures = count ?? 0
    videoInfo = { ...videoInfo, recent_failures: renderFailures }
  } catch {
    /* optional */
  }

  let igStaleHours: number | null = null
  let publishStoppedDays: number | null = null
  try {
    const admin = createAdminClient()
    const { data: lastSnap } = await admin
      .from('marketing_instagram_metric_snapshots')
      .select('captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastSnap?.captured_at) {
      igStaleHours =
        (Date.now() - new Date(lastSnap.captured_at as string).getTime()) / 3600_000
    }
    const { data: lastPost } = await admin
      .from('marketing_content')
      .select('posted_at')
      .eq('platform', 'instagram')
      .not('posted_at', 'is', null)
      .order('posted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastPost?.posted_at) {
      publishStoppedDays =
        (Date.now() - new Date(lastPost.posted_at as string).getTime()) / 86400_000
    }
  } catch {
    /* tables may be empty */
  }

  const admin = createAdminClient()
  const { count: failedJobs } = await admin
    .from('jarvis_background_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())

  const funnelPerf = perf ?? {
    byFunnel: [],
    unclassified: { spend: 0 },
  }

  const anomalies = detectBusinessAnomalies({
    funnelPerformance: (funnelPerf as {
      byFunnel: {
        funnel_name: string
        classified: boolean
        spend: number
        cpa: number | null
        max_acceptable_cpa: number | null
        target_cpa: number | null
        initial_roas: number | null
        target_roas: number | null
      }[]
      unclassified: { spend: number }
    }),
    lurvox: todayRev
      ? {
          ok: Boolean(todayRev.ok),
          today_gross_inr: todayRev.ok ? todayRev.gross_inr : null,
          yesterday_gross_inr: yesterdayRev?.ok ? yesterdayRev.gross_inr : null,
          data_status: todayRev.data_status,
        }
      : null,
    pendingApprovals: approvals.length,
    failedJobs: failedJobs ?? 0,
    metaConfigured: Boolean(meta?.configured),
    metaLastSyncAt: meta?.lastSyncAt ?? null,
    budgetNearExhaustion: Boolean(
      cost &&
        typeof (cost as { daily_spent_usd?: number }).daily_spent_usd === 'number' &&
        typeof (cost as { daily_limit_usd?: number }).daily_limit_usd === 'number' &&
        (cost as { daily_limit_usd: number }).daily_limit_usd > 0 &&
        (cost as { daily_spent_usd: number }).daily_spent_usd /
          (cost as { daily_limit_usd: number }).daily_limit_usd >=
          0.9
    ),
    contentBlocked,
    contentNeedsReview,
    publishStoppedDays,
    renderFailures,
    igSyncStaleHours: igStaleHours,
    shopifyError: false,
    researchBudgetExhausted: false,
  })

  const systemsUnavailable: string[] = []
  for (const h of healthChecks as { name?: string; id?: string; status?: string }[]) {
    if (h.status === 'failed' || h.status === 'degraded') {
      systemsUnavailable.push(String(h.name ?? h.id ?? 'system'))
    }
  }

  const health = computeBusinessHealth({
    findings: anomalies.findings,
    revenueOk: todayRev?.ok !== false,
    revenueStale: todayRev?.data_status === 'unavailable',
    contentBlocked,
    contentNeedsReview,
    publishingEnabled: liveInstagramPublishingEnabled(),
    igConfigured: isInstagramConfigured(),
    igStale: igStaleHours != null && igStaleHours >= 48,
    budgetExhausted: anomalies.findings.some((f) => f.source === 'jarvis.cost'),
    systemsUnavailable,
  })

  const opportunities = await detectOpportunities({
    funnelPerformance: funnelPerf as {
      byFunnel: {
        funnel_name: string
        classified: boolean
        spend: number
        cpa: number | null
        target_cpa: number | null
        initial_roas: number | null
        target_roas: number | null
      }[]
    },
    contentNeedsReview,
    contentScheduled,
  })

  const systems = {
    meta: mapIntegrationStatus({
      configured: Boolean(meta?.configured),
      ok: Boolean(meta?.configured),
      stale: Boolean(meta?.configured && !(meta as { lastSyncAt?: string | null }).lastSyncAt),
    }),
    instagram: mapIntegrationStatus({
      configured: isInstagramConfigured(),
      stale: igStaleHours != null && igStaleHours >= 48,
    }),
    shopify: mapIntegrationStatus({ configured: isShopifyConfigured() }),
    video: mapIntegrationStatus({ configured: isVideoProviderConfigured() }),
    live_instagram_publishing: liveInstagramPublishingEnabled() ? 'CONNECTED' : 'NOT_CONFIGURED',
    note: 'NOT_CONFIGURED ≠ BROKEN.',
  }

  const data_status: UnifiedObservation['data_status'] =
    todayRev?.ok === false && !perf ? 'failed' : limitations.length ? 'partial' : 'verified'

  return {
    observed_at,
    timezone: BUSINESS_TIMEZONE,
    health,
    revenue: {
      source: 'lurvox.purchases',
      today: todayRev?.ok
        ? { gross_inr: todayRev.gross_inr, paid_count: todayRev.paid_count, data_status: todayRev.data_status }
        : { gross_inr: null, data_status: todayRev?.data_status ?? 'unavailable' },
      yesterday: yesterdayRev?.ok
        ? {
            gross_inr: yesterdayRev.gross_inr,
            paid_count: yesterdayRev.paid_count,
            data_status: yesterdayRev.data_status,
          }
        : { gross_inr: null, data_status: 'unavailable' },
      note: 'Shopify is not LURVOX coaching revenue.',
    },
    marketing: {
      funnel_days: 7,
      by_funnel: (funnelPerf as { byFunnel?: unknown[] }).byFunnel ?? [],
      unclassified: (funnelPerf as { unclassified?: unknown }).unclassified ?? null,
      meta_last_sync: meta?.lastSyncAt ?? null,
    },
    funnels: {
      performance_available: Boolean(perf),
    },
    instagram: {
      configured: isInstagramConfigured(),
      live_publishing: liveInstagramPublishingEnabled(),
      stale_hours: igStaleHours,
      publish_quiet_days: publishStoppedDays,
    },
    content: contentSummary,
    video: videoInfo,
    research: { note: 'Trend research runs on demand / niche maintenance — not every cycle.' },
    systems,
    findings: anomalies.attention,
    opportunities,
    data_status,
    limitations: [
      ...limitations,
      'Anomalies use configured funnel targets where available — not universal benchmarks.',
      'Opportunity ≠ guaranteed result.',
    ],
    ...(opts?.cycleId ? {} : {}),
  }
}
