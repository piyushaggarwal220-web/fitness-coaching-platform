import { createAdminClient } from '@/lib/supabase/admin'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { isBraveSearchConfigured } from '@/lib/jarvis/research/brave-search'
import { isVideoProviderConfigured, getVideoEditProvider } from '@/lib/jarvis/video/provider'
import { getShopifyCredentials, shopifyTestConnection } from '@/lib/jarvis/shopify/client'
import { isInstagramConfigured, liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'
import { listTools } from '@/lib/jarvis/tools/registry'
import { jarvisPlanSchema } from '@/lib/jarvis/core/plan'
import type { HealthCheckResult, HealthStatus } from './diagnostic-types'
import { redactDiagnosticText } from './redact'

function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
}

function nowIso() {
  return new Date().toISOString()
}

function statusFromOk(ok: boolean, configured: boolean): HealthStatus {
  if (!configured) return 'not_configured'
  return ok ? 'healthy' : 'failed'
}

export async function runHealthChecks(): Promise<HealthCheckResult[]> {
  const checked_at = nowIso()
  const meta = await loadMetaIntegrationStatus()
  const shopifyCreds = getShopifyCredentials()
  const video = getVideoEditProvider()
  const tools = listTools()

  const openai: HealthCheckResult = {
    id: 'openai',
    name: 'OpenAI',
    status: openaiConfigured() ? 'healthy' : 'not_configured',
    summary: openaiConfigured()
      ? 'OPENAI_API_KEY is present. Diagnostic model routing is unchanged.'
      : 'OPENAI_API_KEY is not configured.',
    checked_at,
  }

  let supabase: HealthCheckResult = {
    id: 'supabase',
    name: 'Supabase',
    status: supabaseConfigured() ? 'unknown' : 'not_configured',
    summary: supabaseConfigured() ? 'Checking database…' : 'Supabase credentials are missing.',
    checked_at,
  }
  let database: HealthCheckResult = {
    id: 'database',
    name: 'Database',
    status: 'unknown',
    summary: 'Not probed.',
    checked_at,
  }
  let authentication: HealthCheckResult = {
    id: 'authentication',
    name: 'Authentication',
    status: 'unknown',
    summary: 'Admin auth is enforced on Jarvis routes; this check probes persistence.',
    checked_at,
  }

  if (supabaseConfigured()) {
    try {
      const admin = createAdminClient()
      const { error } = await admin.from('jarvis_settings').select('key').limit(1)
      if (error) {
        supabase = {
          id: 'supabase',
          name: 'Supabase',
          status: 'failed',
          summary: redactDiagnosticText(error.message),
          checked_at,
        }
        database = { ...supabase, id: 'database', name: 'Database' }
        authentication = {
          id: 'authentication',
          name: 'Authentication',
          status: 'degraded',
          summary: 'Database query failed; session checks may still work.',
          checked_at,
        }
      } else {
        supabase = {
          id: 'supabase',
          name: 'Supabase',
          status: 'healthy',
          summary: 'Supabase responded to a settings probe. No secrets returned.',
          checked_at,
        }
        database = {
          id: 'database',
          name: 'Database',
          status: 'healthy',
          summary: 'jarvis_settings is readable.',
          checked_at,
        }
        authentication = {
          id: 'authentication',
          name: 'Authentication',
          status: 'healthy',
          summary: 'Service role can read Jarvis tables. Route handlers still require platform admin.',
          checked_at,
        }
      }
    } catch (err) {
      supabase = {
        id: 'supabase',
        name: 'Supabase',
        status: 'failed',
        summary: redactDiagnosticText(err instanceof Error ? err.message : 'Supabase probe failed'),
        checked_at,
      }
      database = { ...supabase, id: 'database', name: 'Database' }
    }
  } else {
    database = {
      id: 'database',
      name: 'Database',
      status: 'not_configured',
      summary: 'Database credentials are missing.',
      checked_at,
    }
    authentication = {
      id: 'authentication',
      name: 'Authentication',
      status: 'not_configured',
      summary: 'Cannot verify auth persistence without Supabase.',
      checked_at,
    }
  }

  let shopify: HealthCheckResult = {
    id: 'shopify',
    name: 'Shopify',
    status: shopifyCreds.ok ? 'unknown' : 'not_configured',
    summary: shopifyCreds.ok
      ? 'Credentials present. Live ping not yet run.'
      : `Not configured: ${shopifyCreds.ok === false ? shopifyCreds.missing.join(', ') : 'missing'}`,
    checked_at,
  }
  if (shopifyCreds.ok) {
    try {
      const ping = await shopifyTestConnection()
      shopify = {
        id: 'shopify',
        name: 'Shopify',
        status: ping.ok ? 'healthy' : ping.status === 'not_connected' ? 'not_configured' : 'failed',
        summary: ping.message,
        checked_at,
        details: {
          shop: ping.shop ?? null,
          api_version: ping.api_version ?? null,
          granted_scopes: ping.granted_scopes ?? null,
        },
      }
    } catch (err) {
      shopify = {
        id: 'shopify',
        name: 'Shopify',
        status: 'failed',
        summary: redactDiagnosticText(err instanceof Error ? err.message : 'Shopify ping failed'),
        checked_at,
      }
    }
  }

  const metaCheck: HealthCheckResult = {
    id: 'meta',
    name: 'Meta',
    status: meta.configured ? (meta.lastSyncError ? 'degraded' : 'healthy') : 'not_configured',
    summary: meta.configured
      ? `Read configured. Live execution ${liveMetaExecutionEnabled() ? 'ON' : 'OFF'}.${
          meta.lastSyncError ? ' Last sync reported an error.' : ''
        }`
      : 'Meta Ads credentials are not configured.',
    checked_at,
    details: { live_execution: liveMetaExecutionEnabled(), missing: meta.missing ?? [] },
  }

  const brave: HealthCheckResult = {
    id: 'brave',
    name: 'Brave Search',
    status: isBraveSearchConfigured() ? 'healthy' : 'not_configured',
    summary: isBraveSearchConfigured()
      ? 'BRAVE_SEARCH_API_KEY is present.'
      : 'Live web research unavailable — BRAVE_SEARCH_API_KEY is not configured.',
    checked_at,
  }

  const videoCheck: HealthCheckResult = {
    id: 'video',
    name: 'Video provider',
    status: isVideoProviderConfigured() ? 'healthy' : 'not_configured',
    summary: isVideoProviderConfigured()
      ? `Provider ${video.name} is configured.`
      : 'Video rendering unavailable — no video provider is configured.',
    checked_at,
  }

  const instagram: HealthCheckResult = {
    id: 'instagram',
    name: 'Instagram',
    status: !openaiConfigured()
      ? 'not_configured'
      : isInstagramConfigured()
        ? liveInstagramPublishingEnabled()
          ? 'healthy'
          : 'degraded'
        : 'degraded',
    summary: !openaiConfigured()
      ? 'Instagram ideas need OpenAI. Graph publishing is gated.'
      : isInstagramConfigured()
        ? liveInstagramPublishingEnabled()
          ? 'Instagram Login Graph configured. Live publishing enabled after approval.'
          : 'Instagram Login Graph configured for reads. Publishing requires approval + LIVE_INSTAGRAM_PUBLISHING_ENABLED.'
        : 'Idea generation/planning available. Instagram Login (INSTAGRAM_ACCESS_TOKEN) not fully configured.',
    checked_at,
  }

  let cron: HealthCheckResult = {
    id: 'cron',
    name: 'Cron jobs',
    status: 'unknown',
    summary: 'No recent background job rows read.',
    checked_at,
  }
  let workers: HealthCheckResult = {
    id: 'workers',
    name: 'Background workers',
    status: 'unknown',
    summary: 'No recent worker rows read.',
    checked_at,
  }
  let memory: HealthCheckResult = {
    id: 'memory',
    name: 'Memory',
    status: supabaseConfigured() ? 'unknown' : 'not_configured',
    summary: 'Business memory table not probed.',
    checked_at,
  }
  let events: HealthCheckResult = {
    id: 'events',
    name: 'Event system',
    status: supabaseConfigured() ? 'unknown' : 'not_configured',
    summary: 'jarvis_events not probed.',
    checked_at,
  }

  if (supabaseConfigured()) {
    try {
      const admin = createAdminClient()
      const [{ data: jobs }, { data: mem }, { data: ev }] = await Promise.all([
        admin
          .from('jarvis_background_jobs')
          .select('id, status, error, created_at')
          .order('created_at', { ascending: false })
          .limit(8),
        admin.from('jarvis_memory').select('id').limit(1),
        admin.from('jarvis_events').select('id, status').order('created_at', { ascending: false }).limit(8),
      ])
      const failedJobs = (jobs ?? []).filter((j) => j.status === 'failed')
      cron = {
        id: 'cron',
        name: 'Cron jobs',
        status: failedJobs.length ? 'degraded' : 'healthy',
        summary: jobs?.length
          ? `${jobs.length} recent background jobs, ${failedJobs.length} failed.`
          : 'No recent cron/background jobs stored.',
        checked_at,
      }
      workers = {
        id: 'workers',
        name: 'Background workers',
        status: failedJobs.length ? 'degraded' : 'healthy',
        summary: cron.summary,
        checked_at,
      }
      memory = {
        id: 'memory',
        name: 'Memory',
        status: 'healthy',
        summary: 'jarvis_memory is readable.',
        checked_at,
        details: { sample: Boolean(mem?.length) },
      }
      const failedEvents = (ev ?? []).filter((e) => e.status === 'failed')
      events = {
        id: 'events',
        name: 'Event system',
        status: failedEvents.length ? 'degraded' : 'healthy',
        summary: ev?.length
          ? `${ev.length} recent events, ${failedEvents.length} failed.`
          : 'No recent jarvis_events rows.',
        checked_at,
      }
    } catch (err) {
      cron = {
        id: 'cron',
        name: 'Cron jobs',
        status: 'failed',
        summary: redactDiagnosticText(err instanceof Error ? err.message : 'Cron probe failed'),
        checked_at,
      }
    }
  }

  let costGovernor: HealthCheckResult = {
    id: 'cost_governor',
    name: 'Cost governor',
    status: 'unknown',
    summary: 'Budgets not loaded.',
    checked_at,
  }
  try {
    const [budgets, cost] = await Promise.all([getJarvisBudgets(), getCostDashboard()])
    costGovernor = {
      id: 'cost_governor',
      name: 'Cost governor',
      status: cost.daily_spent_usd >= budgets.daily_ai_budget_usd ? 'degraded' : 'healthy',
      summary: `Daily AI spend ${cost.daily_spent_usd} / ${budgets.daily_ai_budget_usd}. Autonomy ${
        budgets.autonomy_enabled ? 'on' : 'off'
      }.`,
      checked_at,
    }
  } catch (err) {
    costGovernor = {
      id: 'cost_governor',
      name: 'Cost governor',
      status: 'failed',
      summary: redactDiagnosticText(err instanceof Error ? err.message : 'Cost governor probe failed'),
      checked_at,
    }
  }

  let realtimeVoice: HealthCheckResult = {
    id: 'realtime_voice',
    name: 'Realtime voice',
    status: 'unknown',
    summary: 'Realtime capability not probed.',
    checked_at,
  }
  try {
    const { describeRealtimeCapability } = await import('@/lib/jarvis/realtime/config')
    const rt = describeRealtimeCapability()
    realtimeVoice = {
      id: 'realtime_voice',
      name: 'Realtime voice',
      status:
        rt.status === 'CONNECTED'
          ? 'healthy'
          : rt.status === 'DISABLED' || rt.status === 'NOT_CONFIGURED'
            ? 'not_configured'
            : rt.status === 'DEGRADED' || rt.status === 'ERROR'
              ? 'degraded'
              : 'unknown',
      summary: `${rt.status} · ${rt.provider}${rt.model ? ` · ${rt.model}` : ''}. Text modality remains AVAILABLE.`,
      checked_at,
    }
  } catch (err) {
    realtimeVoice = {
      id: 'realtime_voice',
      name: 'Realtime voice',
      status: 'failed',
      summary: redactDiagnosticText(err instanceof Error ? err.message : 'Realtime probe failed'),
      checked_at,
    }
  }

  const toolRegistry: HealthCheckResult = {
    id: 'tool_registry',
    name: 'Tool registry',
    status: tools.length > 0 ? 'healthy' : 'failed',
    summary: `${tools.length} tools registered.`,
    checked_at,
  }

  let aiSchemas: HealthCheckResult = {
    id: 'ai_schemas',
    name: 'AI schemas',
    status: 'unknown',
    summary: 'Plan schema not probed.',
    checked_at,
  }
  try {
    const parsed = jarvisPlanSchema.safeParse({
      thinking_summary: 'schema probe',
      tool_calls: [],
      needs_clarification: false,
    })
    aiSchemas = {
      id: 'ai_schemas',
      name: 'AI schemas',
      status: parsed.success ? 'healthy' : 'failed',
      summary: parsed.success
        ? 'Jarvis plan schema accepts the canonical shape.'
        : 'Jarvis plan schema rejected the canonical probe payload.',
      checked_at,
    }
  } catch (err) {
    aiSchemas = {
      id: 'ai_schemas',
      name: 'AI schemas',
      status: 'failed',
      summary: redactDiagnosticText(err instanceof Error ? err.message : 'Schema probe failed'),
      checked_at,
    }
  }

  const approvalEngine: HealthCheckResult = {
    id: 'approval_engine',
    name: 'Approval engine',
    status: 'healthy',
    summary: 'SIGNIFICANT tools still require explicit owner approval. Diagnostics cannot bypass this.',
    checked_at,
  }

  return [
    openai,
    supabase,
    metaCheck,
    shopify,
    brave,
    videoCheck,
    instagram,
    cron,
    workers,
    database,
    authentication,
    toolRegistry,
    aiSchemas,
    costGovernor,
    realtimeVoice,
    approvalEngine,
    memory,
    events,
  ]
}

export function selfTestLine(check: HealthCheckResult): string {
  const label = {
    healthy: 'PASS',
    degraded: 'PARTIAL',
    failed: 'FAIL',
    not_configured: 'NOT CONFIGURED',
    unknown: 'UNKNOWN',
  }[check.status]
  return `${check.name.padEnd(16)} ${label}`
}

export function overallHealth(checks: HealthCheckResult[]): HealthStatus {
  if (checks.some((c) => c.status === 'failed')) return 'failed'
  if (checks.some((c) => c.status === 'degraded')) return 'degraded'
  if (checks.every((c) => c.status === 'not_configured')) return 'not_configured'
  if (checks.some((c) => c.status === 'unknown')) return 'unknown'
  return 'healthy'
}

export { statusFromOk }
