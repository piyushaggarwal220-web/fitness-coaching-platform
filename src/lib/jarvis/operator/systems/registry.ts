/**
 * Phase 2 business system registry — composes existing integrations/health.
 * Does not invent connectivity from env alone; uses live health where available.
 */

import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import {
  isInstagramConfigured,
  liveInstagramPublishingEnabled,
  instagramStatus,
} from '@/lib/jarvis/instagram'
import { getShopifyCredentials, isShopifyConfigured } from '@/lib/jarvis/shopify/client'
import { isBraveSearchConfigured } from '@/lib/jarvis/research/brave-search'
import {
  describeVideoProviderConfig,
  getVideoEditProvider,
  isVideoProviderConfigured,
} from '@/lib/jarvis/video/provider'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { createAdminClient } from '@/lib/supabase/admin'

export type BusinessSystemId =
  | 'lurvox_revenue'
  | 'lurvox_funnels'
  | 'meta_ads'
  | 'instagram'
  | 'shopify'
  | 'creatives'
  | 'video'
  | 'research'
  | 'memory'
  | 'analytics'
  | 'tasks'
  | 'approvals'
  | 'cost'
  | 'notifications'

export type SystemConnectionState =
  | 'CONNECTED'
  | 'DEGRADED'
  | 'READ_ONLY'
  | 'ACTION_DISABLED'
  | 'NOT_CONFIGURED'
  | 'ERROR'
  | 'UNKNOWN'

export type BusinessSystemRecord = {
  id: BusinessSystemId
  display_name: string
  purpose: string
  read_capabilities: string[]
  write_capabilities: string[]
  connection_state: SystemConnectionState
  freshness: 'fresh' | 'aging' | 'stale' | 'unknown' | 'n/a'
  last_successful_sync: string | null
  health: string
  permission_requirements: string
  live_execution_enabled: boolean | null
  tool_prefixes: string[]
  notes: string[]
}

function ageFreshness(iso: string | null | undefined): BusinessSystemRecord['freshness'] {
  if (!iso) return 'unknown'
  const age = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(age)) return 'unknown'
  if (age <= 2 * 3600_000) return 'fresh'
  if (age <= 24 * 3600_000) return 'aging'
  return 'stale'
}

function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
}

/**
 * Build the canonical business-system registry for the operator.
 * Secrets are never included.
 */
export async function buildBusinessSystemRegistry(): Promise<{
  systems: BusinessSystemRecord[]
  retrieved_at: string
}> {
  const retrieved_at = new Date().toISOString()
  const admin = createAdminClient()

  const [meta, igStatus, cost, approvals, { data: openTasks }, { count: failedJobs }] =
    await Promise.all([
      loadMetaIntegrationStatus().catch(() => null),
      isInstagramConfigured()
        ? Promise.resolve().then(() => instagramStatus())
        : Promise.resolve(null),
      getCostDashboard().catch(() => null),
      listPendingApprovals(20).catch(() => []),
      admin
        .from('jarvis_tasks')
        .select('id')
        .in('status', ['running', 'awaiting_approval', 'queued'])
        .limit(20),
      admin
        .from('jarvis_background_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed'),
    ])

  const liveMeta = liveMetaExecutionEnabled()
  const liveIg = liveInstagramPublishingEnabled()
  const shopifyCreds = getShopifyCredentials()
  const videoConfigured = isVideoProviderConfigured()
  const video = getVideoEditProvider()
  const videoDesc = describeVideoProviderConfig()

  const systems: BusinessSystemRecord[] = [
    {
      id: 'lurvox_revenue',
      display_name: 'LURVOX Revenue',
      purpose: 'Canonical coaching/product cash from public.purchases (Razorpay, Asia/Kolkata)',
      read_capabilities: ['today/yesterday/range revenue', 'order counts', 'AOV', 'refunds where available'],
      write_capabilities: [],
      connection_state: supabaseConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: supabaseConfigured() ? 'Reads via lurvox.revenue / shared purchase ledger' : 'Supabase missing',
      permission_requirements: 'READ only',
      live_execution_enabled: null,
      tool_prefixes: ['lurvox.'],
      notes: ['Never Shopify orders. Never Meta conversion value as cash.'],
    },
    {
      id: 'lurvox_funnels',
      display_name: 'LURVOX Funnels',
      purpose: 'Configured funnel economics (₹99 / ₹1,699) — independent units',
      read_capabilities: ['list funnels', 'targets', 'performance by funnel', 'UNCLASSIFIED'],
      write_capabilities: [],
      connection_state: supabaseConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: 'Configured marketing_funnels + Meta performance join',
      permission_requirements: 'READ; never guess funnel_id from price',
      live_execution_enabled: null,
      tool_prefixes: ['funnels.'],
      notes: ['Keep ₹99 and ₹1,699 economics separate unless user asks portfolio view.'],
    },
    {
      id: 'meta_ads',
      display_name: 'Meta Ads',
      purpose: 'Ad spend, attributed purchases, CPA/ROAS — not LURVOX cash revenue',
      read_capabilities: ['status', 'sync', 'campaign/adset/ad performance', 'funnel assignment'],
      write_capabilities: ['pause_ad', 'increase/decrease budget', 'push_creative', 'create_test'],
      connection_state: !meta?.configured
        ? 'NOT_CONFIGURED'
        : meta.lastSyncError
          ? 'ERROR'
          : !meta.lastSyncAt
            ? 'DEGRADED'
            : liveMeta
              ? 'CONNECTED'
              : 'ACTION_DISABLED',
      freshness: ageFreshness(meta?.lastSyncAt),
      last_successful_sync: meta?.lastSyncAt ?? null,
      health: meta?.configured
        ? meta.lastSyncError
          ? `Last sync error recorded`
          : meta.lastSyncAt
            ? `Synced; live writes ${liveMeta ? 'enabled' : 'disabled'}`
            : 'Configured but never synced'
        : 'Meta credentials missing',
      permission_requirements: 'SIGNIFICANT writes require approval; DANGEROUS blocked',
      live_execution_enabled: liveMeta,
      tool_prefixes: ['meta.'],
      notes: [
        liveMeta
          ? 'LIVE_META_EXECUTION_ENABLED=true — writes still go through risk/approval'
          : 'LIVE_META_EXECUTION_ENABLED=false — writes recorded_not_executed unless pause-only path allows',
      ],
    },
    {
      id: 'instagram',
      display_name: 'Instagram',
      purpose: 'Organic Graph reads + gated publish (Instagram Login)',
      read_capabilities: ['profile', 'media', 'insights', 'content performance', 'sync'],
      write_capabilities: ['publish (gated)', 'delete_media (gated)'],
      connection_state: !isInstagramConfigured()
        ? 'NOT_CONFIGURED'
        : igStatus && (igStatus as { ok?: boolean }).ok === false
          ? 'ERROR'
          : liveIg
            ? 'CONNECTED'
            : 'READ_ONLY',
      freshness: 'unknown',
      last_successful_sync: null,
      health: isInstagramConfigured()
        ? `Graph reads available; publishing ${liveIg ? 'may execute after approval' : 'disabled'}`
        : 'Instagram Login token / account not configured',
      permission_requirements: 'Publish/delete SIGNIFICANT + LIVE_INSTAGRAM_PUBLISHING_ENABLED',
      live_execution_enabled: liveIg,
      tool_prefixes: ['instagram.'],
      notes: ['Credential/settings tools remain DANGEROUS/blocked.'],
    },
    {
      id: 'shopify',
      display_name: 'Shopify',
      purpose: 'Store commerce only — separate from LURVOX Razorpay revenue',
      read_capabilities: ['products', 'orders', 'order stats', 'today commerce'],
      write_capabilities: ['description', 'SEO', 'price', 'status', 'image'],
      connection_state: !isShopifyConfigured()
        ? 'NOT_CONFIGURED'
        : shopifyCreds.ok
          ? 'CONNECTED'
          : 'ERROR',
      freshness: 'n/a',
      last_successful_sync: null,
      health: isShopifyConfigured()
        ? 'Admin API credentials present'
        : 'SHOPIFY_SHOP + CLIENT_ID + CLIENT_SECRET required',
      permission_requirements: 'Price/status/image SIGNIFICANT; payment/credentials DANGEROUS',
      live_execution_enabled: isShopifyConfigured(),
      tool_prefixes: ['shopify.'],
      notes: ['Never reconcile Shopify orders to LURVOX purchases without verified relationship.'],
    },
    {
      id: 'creatives',
      display_name: 'Creative System',
      purpose: 'Creative performance + static concept generation (funnel-preserving)',
      read_capabilities: ['creative performance', 'winners/losers classifications'],
      write_capabilities: ['generate_static drafts (no ad spend)'],
      connection_state: openaiConfigured() && supabaseConfigured() ? 'CONNECTED' : 'DEGRADED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: 'Uses marketing creatives + OpenAI generation',
      permission_requirements: 'Generation LOW_RISK; Meta push SIGNIFICANT',
      live_execution_enabled: null,
      tool_prefixes: ['creatives.'],
      notes: ['Generating creatives does not spend ad budget.'],
    },
    {
      id: 'video',
      display_name: 'Video System',
      purpose: 'Video edit jobs via configured VideoEditProvider (e.g. Shotstack)',
      read_capabilities: ['list jobs', 'provider status', 'sources'],
      write_capabilities: ['create_edit_job', 'analyze', 'render', 'cancel'],
      connection_state: !videoConfigured
        ? 'NOT_CONFIGURED'
        : video.configured
          ? 'CONNECTED'
          : 'DEGRADED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: videoDesc.note || (videoConfigured ? video.name : 'Video provider not configured'),
      permission_requirements: 'Jobs LOW_RISK/READ; no fake AI scene understanding',
      live_execution_enabled: videoConfigured,
      tool_prefixes: ['video.'],
      notes: [
        'Do not claim silence/face/transcription unless provider supports it',
        `Provider: ${video.name}`,
      ],
    },
    {
      id: 'research',
      display_name: 'Research',
      purpose: 'Bounded Brave web research with source-backed findings',
      read_capabilities: ['objective research'],
      write_capabilities: [],
      connection_state: isBraveSearchConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: isBraveSearchConfigured() ? 'Brave Search configured' : 'BRAVE_SEARCH_API_KEY missing',
      permission_requirements: 'Cost-governed; bounded searches',
      live_execution_enabled: isBraveSearchConfigured(),
      tool_prefixes: ['research.'],
      notes: ['Separate SOURCE-BACKED findings from interpretation.'],
    },
    {
      id: 'memory',
      display_name: 'Memory',
      purpose: 'Durable facts, preferences, decisions, lessons, hypotheses, rules',
      read_capabilities: ['search', 'relevance retrieval'],
      write_capabilities: ['remember (validated)'],
      connection_state: supabaseConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: 'jarvis_memory',
      permission_requirements: 'Facts require source; lessons require evidence',
      live_execution_enabled: null,
      tool_prefixes: ['memory.'],
      notes: [],
    },
    {
      id: 'analytics',
      display_name: 'Analytics',
      purpose: 'Cross-system investigation and overview reports',
      read_capabilities: ['today_overview', 'investigate', 'daily_report', 'budget recommendations'],
      write_capabilities: [],
      connection_state: openaiConfigured() ? 'CONNECTED' : 'DEGRADED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: 'analytics.* tools',
      permission_requirements: 'LOW_RISK investigation; cost bounded',
      live_execution_enabled: null,
      tool_prefixes: ['analytics.'],
      notes: [],
    },
    {
      id: 'tasks',
      display_name: 'Tasks / Plans',
      purpose: 'Durable multi-step operator plans on jarvis_tasks',
      read_capabilities: ['list tasks', 'plan status'],
      write_capabilities: ['create/update via orchestrator'],
      connection_state: supabaseConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: `${openTasks?.length ?? 0} open task(s); ${failedJobs ?? 0} failed background job(s)`,
      permission_requirements: 'Internal',
      live_execution_enabled: null,
      tool_prefixes: [],
      notes: [],
    },
    {
      id: 'approvals',
      display_name: 'Approvals',
      purpose: 'Significant-action gate with WHAT/WHY/TARGET briefings',
      read_capabilities: ['list pending'],
      write_capabilities: ['approve/reject via API'],
      connection_state: supabaseConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: `${approvals.length} pending approval(s)`,
      permission_requirements: 'Owner admin',
      live_execution_enabled: null,
      tool_prefixes: ['system.'],
      notes: [],
    },
    {
      id: 'cost',
      display_name: 'Cost / Budget',
      purpose: 'AI spend governor — Jarvis cannot raise limits',
      read_capabilities: ['cost_status', 'daily/monthly spend'],
      write_capabilities: [],
      connection_state: cost ? 'CONNECTED' : 'UNKNOWN',
      freshness: 'fresh',
      last_successful_sync: retrieved_at,
      health: cost
        ? `$${Number(cost.daily_spent_usd).toFixed(2)} / $${Number(cost.daily_limit_usd).toFixed(2)} today`
        : 'Cost dashboard unavailable',
      permission_requirements: 'READ; raise_budget forbidden',
      live_execution_enabled: null,
      tool_prefixes: ['system.'],
      notes: [],
    },
    {
      id: 'notifications',
      display_name: 'Notifications',
      purpose: 'Proactive NOTICE+ alerts and activity',
      read_capabilities: ['list notifications'],
      write_capabilities: ['mark read'],
      connection_state: supabaseConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED',
      freshness: 'n/a',
      last_successful_sync: null,
      health: 'jarvis_notifications',
      permission_requirements: 'Internal',
      live_execution_enabled: null,
      tool_prefixes: [],
      notes: [],
    },
  ]

  return { systems, retrieved_at }
}

export function getSystem(registry: BusinessSystemRecord[], id: BusinessSystemId) {
  return registry.find((s) => s.id === id) ?? null
}
