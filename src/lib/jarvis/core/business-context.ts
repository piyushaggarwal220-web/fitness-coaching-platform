/**
 * Canonical Phase 1 business context — provenance on every slice.
 * Reuses existing SOT / pulse / funnels / cost / approvals. Does not invent metrics.
 */

import { listFunnels } from '@/lib/ai-marketing/funnels'
import { getMarketingOverview } from '@/lib/ai-marketing/overview'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { jarvisMetricOperatorNotes } from '@/lib/jarvis/metrics/source-of-truth'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUSINESS_TIMEZONE } from '@/lib/jarvis/diagnostics/provenance'

export type ContextFreshness = 'fresh' | 'aging' | 'stale' | 'unknown'

export type ContextSlice<T> = {
  data: T
  source: string
  retrieved_at: string
  freshness: ContextFreshness
  confidence: 'low' | 'medium' | 'high'
  scope: string
  data_status?: string
  note?: string
}

function ageFreshness(iso: string | null | undefined, freshMs: number, staleMs: number): ContextFreshness {
  if (!iso) return 'unknown'
  const age = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(age)) return 'unknown'
  if (age <= freshMs) return 'fresh'
  if (age <= staleMs) return 'aging'
  return 'stale'
}

function slice<T>(
  data: T,
  opts: {
    source: string
    scope: string
    confidence?: 'low' | 'medium' | 'high'
    asOf?: string | null
    freshMs?: number
    staleMs?: number
    data_status?: string
    note?: string
  }
): ContextSlice<T> {
  const retrieved_at = new Date().toISOString()
  return {
    data,
    source: opts.source,
    retrieved_at,
    freshness: ageFreshness(opts.asOf ?? retrieved_at, opts.freshMs ?? 15 * 60_000, opts.staleMs ?? 6 * 3600_000),
    confidence: opts.confidence ?? 'medium',
    scope: opts.scope,
    data_status: opts.data_status,
    note: opts.note,
  }
}

/**
 * Build canonical business context for the orchestrator / investigations.
 * Stale Meta sync is labeled stale — not treated as current truth.
 */
export async function buildBusinessContextEngine(): Promise<{
  business: ContextSlice<{
    brand: string
    objectives: string[]
    timezone: string
    active_funnels: {
      id: string
      slug: string
      name: string
      price_inr: number | null
      target_cpa: number | null
      max_acceptable_cpa: number | null
      target_roas: number | null
      daily_budget_inr: number | null
    }[]
  }>
  marketing: ContextSlice<{
    autonomy_level: number
    live_meta_execution: boolean
    meta: unknown
    overview: unknown
  }>
  revenue: ContextSlice<{ note: string; metric: string }>
  commerce: ContextSlice<{ note: string }>
  content: ContextSlice<{ note: string }>
  operations: ContextSlice<{
    pending_approvals: number
    open_tasks: number
    failed_jobs: number
    recent_failures: string[]
  }>
  rules: string[]
}> {
  const now = new Date().toISOString()
  const admin = createAdminClient()

  const [funnels, overview, autonomy, meta, approvals, { data: openTasks }, { data: failedJobs }] =
    await Promise.all([
      listFunnels().catch(() => []),
      getMarketingOverview().catch(() => null),
      getAutonomyLevel(),
      loadMetaIntegrationStatus().catch(() => null),
      listPendingApprovals(20),
      admin
        .from('jarvis_tasks')
        .select('id, status, objective')
        .in('status', ['running', 'awaiting_approval', 'queued'])
        .limit(20),
      admin
        .from('jarvis_background_jobs')
        .select('id, job_type, error, created_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

  const metaAsOf = meta?.lastSyncAt ?? null
  const metaFresh = ageFreshness(metaAsOf, 2 * 3600_000, 24 * 3600_000)

  return {
    business: slice(
      {
        brand: 'LURVOX',
        objectives: [
          'Grow profitable LURVOX coaching revenue (public.purchases)',
          'Keep funnel economics separate (₹99 vs ₹1,699)',
          'Operate Meta Ads within CPA/ROAS targets',
          'Never publish Instagram or raise budgets without approval gates',
        ],
        timezone: BUSINESS_TIMEZONE,
        active_funnels: funnels.map((f) => ({
          id: f.id,
          slug: f.slug,
          name: f.name,
          price_inr: f.price_inr,
          target_cpa: f.target_cpa,
          max_acceptable_cpa: f.max_acceptable_cpa,
          target_roas: f.target_roas,
          daily_budget_inr: f.daily_budget_inr,
        })),
      },
      {
        source: 'marketing_funnels + jarvis business rules',
        scope: 'business',
        confidence: 'high',
        asOf: now,
        note: 'Funnel targets are configured values — not inferred from purchase amounts.',
      }
    ),
    marketing: slice(
      {
        autonomy_level: autonomy,
        live_meta_execution: liveMetaExecutionEnabled(),
        meta,
        overview: overview
          ? {
              byFunnel: overview.byFunnel,
              unclassified: overview.unclassified,
              pendingApprovals: overview.pendingApprovals,
              blended_note: 'Blended totals are reporting only.',
            }
          : null,
      },
      {
        source: 'marketing_performance + Meta integration status',
        scope: 'marketing',
        confidence: metaFresh === 'stale' || metaFresh === 'unknown' ? 'low' : 'medium',
        asOf: metaAsOf,
        freshMs: 2 * 3600_000,
        staleMs: 24 * 3600_000,
        data_status: meta?.configured ? (metaAsOf ? 'verified' : 'unavailable') : 'unavailable',
        note:
          metaFresh === 'stale'
            ? 'Meta sync is stale — do not treat ad metrics as current without re-sync.'
            : undefined,
      }
    ),
    revenue: slice(
      {
        note: 'Use lurvox.revenue / public.purchases (Asia/Kolkata). Never Shopify or Meta as LURVOX cash.',
        metric: 'lurvox_product_revenue',
      },
      {
        source: 'src/lib/jarvis/metrics/source-of-truth.ts + public.purchases',
        scope: 'revenue',
        confidence: 'high',
        asOf: now,
      }
    ),
    commerce: slice(
      {
        note: 'Shopify Admin is store commerce only — separate from LURVOX Razorpay purchases.',
      },
      {
        source: 'Shopify Admin API (when configured)',
        scope: 'commerce',
        confidence: 'medium',
        asOf: now,
      }
    ),
    content: slice(
      {
        note: 'Instagram organic via Instagram Login Graph + marketing_content. Publishing gated.',
      },
      {
        source: 'Instagram Graph + marketing_content',
        scope: 'content',
        confidence: 'medium',
        asOf: now,
      }
    ),
    operations: slice(
      {
        pending_approvals: approvals.length,
        open_tasks: openTasks?.length ?? 0,
        failed_jobs: failedJobs?.length ?? 0,
        recent_failures: (failedJobs ?? []).map(
          (j) => `${j.job_type}: ${String(j.error || 'failed').slice(0, 120)}`
        ),
      },
      {
        source: 'jarvis_approvals + jarvis_tasks + jarvis_background_jobs',
        scope: 'operations',
        confidence: 'high',
        asOf: now,
      }
    ),
    rules: [
      'Never blend ₹99 and ₹1,699 funnel economics.',
      'Never invent Meta/performance numbers — use tools.',
      'SIGNIFICANT actions require approval; DANGEROUS stay blocked.',
      'Never raise AI budget or disable audit.',
      'API failure / unavailable ≠ numeric 0.',
      'Do not treat stale Meta sync as current.',
      ...jarvisMetricOperatorNotes(),
    ],
  }
}

/** Cost/budget snapshot for context (separate from business pulse). */
export async function buildCostContextSlice(): Promise<
  ContextSlice<{ cost: unknown; budgets: unknown }>
> {
  const [cost, budgets] = await Promise.all([getCostDashboard(), getJarvisBudgets()])
  return slice(
    { cost, budgets },
    {
      source: 'jarvis_cost_usage + jarvis_settings',
      scope: 'cost',
      confidence: 'high',
      asOf: new Date().toISOString(),
    }
  )
}
