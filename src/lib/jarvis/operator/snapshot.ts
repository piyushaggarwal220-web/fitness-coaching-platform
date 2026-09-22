/**
 * Unified business snapshot for Phase 2 operator — composes existing SOTs.
 * Unavailable data stays explicit (never invented zeros).
 */

import { getPerformanceByFunnel, listFunnels } from '@/lib/ai-marketing/funnels'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'
import { getMarketingOverview } from '@/lib/ai-marketing/overview'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
import { buildBusinessContextEngine } from '@/lib/jarvis/core/business-context'
import { buildBusinessSystemRegistry } from '@/lib/jarvis/operator/systems/registry'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { isShopifyConfigured, shopifyOrderStats } from '@/lib/jarvis/shopify/client'
import { isInstagramConfigured, instagramStatus, liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import { describeVideoProviderConfig, isVideoProviderConfigured } from '@/lib/jarvis/video/provider'
import { createAdminClient } from '@/lib/supabase/admin'
import { listRecentLearnings } from '@/lib/jarvis/memory/learning-loop'

export type SnapshotCell = {
  value: number | null
  data_status: 'verified' | 'unavailable' | 'failed' | 'unsupported' | 'unknown'
  note?: string
}

function cellFromRevenue(r: Awaited<ReturnType<typeof loadLurvoxRevenue>>): {
  gross_inr: SnapshotCell
  paid_count: SnapshotCell
  aov_inr: SnapshotCell
} {
  if (!r.ok) {
    return {
      gross_inr: { value: null, data_status: (r.data_status as SnapshotCell['data_status']) || 'failed', note: r.error },
      paid_count: { value: null, data_status: 'failed', note: r.error },
      aov_inr: { value: null, data_status: 'failed', note: r.error },
    }
  }
  const gross = typeof r.gross_inr === 'number' ? r.gross_inr : null
  const count = typeof r.paid_count === 'number' ? r.paid_count : null
  const aov =
    count != null && count > 0 && gross != null ? gross / count : count === 0 ? 0 : null
  return {
    gross_inr: { value: gross, data_status: gross == null ? 'unavailable' : 'verified' },
    paid_count: { value: count, data_status: count == null ? 'unavailable' : 'verified' },
    aov_inr: {
      value: aov,
      data_status: typeof aov === 'number' ? 'verified' : 'unavailable',
    },
  }
}

export async function buildBusinessOperatorSnapshot(opts?: {
  includeShopify?: boolean
  includeInstagram?: boolean
  includeCreatives?: boolean
  creativeDays?: number
}) {
  const includeShopify = opts?.includeShopify ?? true
  const includeInstagram = opts?.includeInstagram ?? true
  const includeCreatives = opts?.includeCreatives ?? true
  const creativeDays = opts?.creativeDays ?? 14

  const [
    registry,
    businessCtx,
    today,
    yesterday,
    week,
    funnels,
    perf,
    overview,
    approvals,
    cost,
    budgets,
    learnings,
  ] = await Promise.all([
    buildBusinessSystemRegistry(),
    buildBusinessContextEngine(),
    loadLurvoxRevenue({ preset: 'today' }),
    loadLurvoxRevenue({ preset: 'yesterday' }),
    loadLurvoxRevenue({ preset: 'last_n_days', days: 7 }),
    listFunnels().catch(() => []),
    getPerformanceByFunnel({ days: 7 }).catch(() => null),
    getMarketingOverview().catch(() => null),
    listPendingApprovals(20),
    getCostDashboard(),
    getJarvisBudgets(),
    listRecentLearnings(6).catch(() => []),
  ])

  let shopify: unknown = {
    loaded: false,
    note: 'Shopify not requested for this snapshot slice.',
  }
  if (includeShopify) {
    if (!isShopifyConfigured()) {
      shopify = {
        loaded: true,
        configured: false,
        data_status: 'unavailable',
        note: 'Shopify not configured — not LURVOX revenue.',
      }
    } else {
      try {
        const stats = await shopifyOrderStats(7)
        shopify = {
          loaded: true,
          configured: true,
          ...stats,
          note: 'Shopify store commerce only — separate from LURVOX purchases.',
        }
      } catch (err) {
        shopify = {
          loaded: true,
          configured: true,
          ok: false,
          data_status: 'failed',
          error: err instanceof Error ? err.message : 'Shopify failed',
          note: 'Shopify read failed — not ₹0 LURVOX revenue.',
        }
      }
    }
  }

  let instagram: unknown = { loaded: false }
  if (includeInstagram) {
    if (!isInstagramConfigured()) {
      instagram = {
        loaded: true,
        configured: false,
        data_status: 'unavailable',
        live_publishing_enabled: false,
      }
    } else {
      try {
        const st = await instagramStatus()
        instagram = {
          loaded: true,
          configured: true,
          status: st,
          live_publishing_enabled: liveInstagramPublishingEnabled(),
        }
      } catch (err) {
        instagram = {
          loaded: true,
          configured: true,
          data_status: 'failed',
          error: err instanceof Error ? err.message : 'Instagram status failed',
          live_publishing_enabled: liveInstagramPublishingEnabled(),
        }
      }
    }
  }

  let creatives: unknown = { loaded: false }
  if (includeCreatives) {
    try {
      const rows = await listCreativePerformance({ days: creativeDays })
      creatives = {
        loaded: true,
        data_status: 'verified',
        days: creativeDays,
        count: rows.length,
        fatigued: rows.filter((c) => c.classification === 'FATIGUED' || c.classification === 'DECLINING')
          .length,
        losers: rows.filter((c) => c.classification === 'LOSER').length,
        sample: rows.slice(0, 8).map((c) => ({
          id: c.creative_id,
          classification: c.classification,
          spend: c.spend,
          cpa: c.cpa,
        })),
      }
    } catch (err) {
      creatives = {
        loaded: true,
        data_status: 'failed',
        error: err instanceof Error ? err.message : 'Creative performance failed',
      }
    }
  }

  const admin = createAdminClient()
  const [{ data: videoJobs }, { data: activeTasks }] = await Promise.all([
    admin
      .from('video_edit_jobs')
      .select('id, status, provider, created_at, error')
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('jarvis_tasks')
      .select('id, objective, status, plan, spent_usd, created_at, error')
      .in('status', ['running', 'awaiting_approval', 'queued', 'paused_budget'])
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const video = {
    provider_configured: isVideoProviderConfigured(),
    provider: describeVideoProviderConfig(),
    recent_jobs: (videoJobs ?? []).map((j) => ({
      id: j.id,
      status: j.status,
      provider: j.provider,
      error: j.error,
      created_at: j.created_at,
    })),
  }

  return {
    retrieved_at: new Date().toISOString(),
    timezone: 'Asia/Kolkata',
    systems: registry.systems,
    business_context: businessCtx,
    revenue: {
      source: 'public.purchases via loadLurvoxRevenue',
      today: cellFromRevenue(today),
      yesterday: cellFromRevenue(yesterday),
      last_7_days: cellFromRevenue(week),
      today_raw_ok: today.ok,
      yesterday_raw_ok: yesterday.ok,
      week_raw_ok: week.ok,
    },
    advertising: {
      source: 'marketing_performance (Meta attributed — not LURVOX cash)',
      overview: overview
        ? {
            byFunnel: overview.byFunnel,
            unclassified: overview.unclassified,
            pendingApprovals: overview.pendingApprovals,
          }
        : { data_status: 'unavailable' as const },
      performance_7d: perf
        ? {
            byFunnel: perf.byFunnel,
            unclassified: perf.unclassified,
            blended_reporting_only: perf.blended,
          }
        : { data_status: 'unavailable' as const },
    },
    funnels: {
      source: 'marketing_funnels',
      items: funnels.map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        price_inr: f.price_inr,
        target_cpa: f.target_cpa,
        max_acceptable_cpa: f.max_acceptable_cpa,
        target_roas: f.target_roas,
        daily_budget_inr: f.daily_budget_inr,
      })),
      note: 'Never assign purchases to funnels by amount alone.',
    },
    shopify,
    instagram,
    creatives,
    video,
    operations: {
      pending_approvals: approvals.map((a) => ({
        id: a.id,
        action: a.action_label,
        tool: a.tool_name,
        risk: a.risk_level,
      })),
      active_tasks: (activeTasks ?? []).map((t) => ({
        id: t.id,
        objective: t.objective,
        status: t.status,
        has_plan: Boolean(t.plan && typeof t.plan === 'object'),
        spent_usd: t.spent_usd,
        error: t.error,
      })),
      cost,
      budgets,
      recent_learning: learnings,
    },
    separations: {
      lurvox_cash: 'public.purchases',
      shopify_commerce: 'Shopify Admin orders',
      meta_ads: 'marketing_performance attributed purchases',
      note: 'These are separate ledgers — do not blend.',
    },
  }
}

export type BusinessOperatorSnapshot = Awaited<ReturnType<typeof buildBusinessOperatorSnapshot>>
