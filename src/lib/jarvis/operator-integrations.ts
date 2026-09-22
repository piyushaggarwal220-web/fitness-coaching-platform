import { createAdminClient } from '@/lib/supabase/admin'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { getShopifyCredentials, shopifyTestConnection } from '@/lib/jarvis/shopify/client'
import { isBraveSearchConfigured } from '@/lib/jarvis/research/brave-search'
import { isVideoProviderConfigured, getVideoEditProvider } from '@/lib/jarvis/video/provider'
import {
  isInstagramConfigured,
  liveInstagramPublishingEnabled,
  instagramStatus,
} from '@/lib/jarvis/instagram'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { FORBIDDEN_TOOL_NAMES, listTools } from '@/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '@/lib/jarvis/permissions/risk-engine'
import { humanToolLabel, toolFamily } from '@/lib/jarvis/operator-present'
import { describeRealtimeCapability } from '@/lib/jarvis/realtime/config'

export type IntegrationStatus = 'connected' | 'not_connected' | 'error' | 'disabled' | 'partial'

export type IntegrationCard = {
  id: string
  name: string
  status: IntegrationStatus
  summary: string
  can_do: string[]
  cannot_do: string[]
  configure_hint: string | null
  testable: boolean
  missing: string[]
}

export type CapabilityGroup = 'WORKING' | 'WAITING FOR INTEGRATION' | 'REQUIRES APPROVAL' | 'BLOCKED'

export type CapabilityItem = {
  title: string
  detail: string
  group: CapabilityGroup
  tool?: string
}

export type SystemHealth = {
  level: 'operational' | 'partial' | 'action_required'
  label: string
  explanation: string
  connected_count: number
  total_count: number
  attention_count: number
}

function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
}

export async function listIntegrationCards(): Promise<IntegrationCard[]> {
  const meta = await loadMetaIntegrationStatus()
  const shopify = getShopifyCredentials()
  const video = getVideoEditProvider()
  const liveMeta = liveMetaExecutionEnabled()
  const openai = openaiConfigured()

  return [
    {
      id: 'openai',
      name: 'OpenAI',
      status: openai ? 'connected' : 'not_connected',
      summary: openai
        ? 'Planning, replies, creatives, and Instagram idea generation.'
        : 'Jarvis cannot think or reply until OPENAI_API_KEY is set on the server.',
      can_do: openai
        ? ['Chat planning', 'Operator replies', 'Creative generation', 'Instagram ideas']
        : [],
      cannot_do: openai ? [] : ['Any AI conversation or generation'],
      configure_hint: openai ? null : 'Set OPENAI_API_KEY in the server environment. It never appears in this UI.',
      testable: true,
      missing: openai ? [] : ['OPENAI_API_KEY'],
    },
    {
      id: 'supabase',
      name: 'Supabase',
      status: supabaseConfigured() ? 'connected' : 'not_connected',
      summary: supabaseConfigured()
        ? 'Conversations, memory, tasks, approvals, and audit persist here.'
        : 'Database credentials are missing.',
      can_do: supabaseConfigured()
        ? ['Store conversations', 'Business memory', 'Tasks', 'Approvals', 'Cost usage']
        : [],
      cannot_do: [],
      configure_hint: supabaseConfigured()
        ? null
        : 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.',
      testable: true,
      missing: [
        ...(!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ? ['NEXT_PUBLIC_SUPABASE_URL'] : []),
        ...(!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
      ],
    },
    {
      id: 'meta',
      name: 'Meta Ads',
      status: meta.configured ? (meta.lastSyncError ? 'error' : 'connected') : 'not_connected',
      summary: meta.configured
        ? `Read performance: Yes. Write actions: Disabled until approved. Live execution: ${liveMeta ? 'Enabled' : 'Disabled'}.`
        : 'Ad spend and campaign reads are unavailable.',
      can_do: meta.configured
        ? [
            'Read campaign performance',
            'Funnel-separated CPA / ROAS',
            'Request budget or pause changes (approval required)',
          ]
        : [],
      cannot_do: [
        liveMeta ? 'Live writes still require the permission engine' : 'Live Meta execution is disabled',
        'Jarvis cannot enable LIVE_META_EXECUTION_ENABLED',
      ],
      configure_hint: meta.configured
        ? null
        : 'Set META_ADS_ACCESS_TOKEN and META_ADS_AD_ACCOUNT_ID on the server.',
      testable: true,
      missing: meta.missing ?? [],
    },
    {
      id: 'shopify',
      name: 'Shopify',
      status: shopify.ok ? 'connected' : 'not_connected',
      summary: shopify.ok
        ? 'Read performance: Yes. Write actions: Disabled. Live catalog/order reads use client credentials.'
        : 'Shopify store orders: unavailable. Shopify store revenue: unavailable. Product management: unavailable.',
      can_do: shopify.ok
        ? ['Shopify store orders and store revenue (not LURVOX checkout)', 'List products', 'Read catalog']
        : [],
      cannot_do: ['Write actions are not enabled', 'Payment settings', 'Billing', 'Credential changes'],
      configure_hint: shopify.ok
        ? null
        : 'Set SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET in the server environment.',
      testable: true,
      missing: shopify.ok ? [] : shopify.missing,
    },
    {
      id: 'instagram',
      name: 'Instagram',
      status: openai
        ? isInstagramConfigured()
          ? 'connected'
          : 'partial'
        : 'not_connected',
      summary: !openai
        ? 'Instagram ideas need OpenAI. Graph publishing is gated.'
        : isInstagramConfigured()
          ? liveInstagramPublishingEnabled()
            ? 'Graph reads available. Live publishing enabled after approval.'
            : 'Graph reads available when token scopes allow. Publishing requires approval + LIVE_INSTAGRAM_PUBLISHING_ENABLED.'
          : 'Idea generation/planning works. Instagram Graph account not fully configured.',
      can_do: [
        ...(openai
          ? [
              'Generate Instagram content ideas',
              'Plan structured Instagram content',
              'Research fitness/Reels trends (via Brave when configured)',
              'Analyze local marketing_content performance',
              'Prepare publish drafts from completed video jobs',
            ]
          : []),
        ...(isInstagramConfigured()
          ? [
              'Read profile/media/insights (scope-dependent)',
              'Sync content intelligence snapshots (read-only)',
              'Analyze historical organic performance',
            ]
          : []),
      ],
      cannot_do: [
        'Autonomous publishing',
        ...(liveInstagramPublishingEnabled() ? [] : ['Live Graph publish until LIVE_INSTAGRAM_PUBLISHING_ENABLED']),
        'Modify account settings',
        'Change Instagram credentials',
      ],
      configure_hint: isInstagramConfigured()
        ? liveInstagramPublishingEnabled()
          ? null
          : 'Set LIVE_INSTAGRAM_PUBLISHING_ENABLED=true only after you intentionally want approved publishes to hit Graph.'
        : 'Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID (Instagram Login → graph.instagram.com). META_ADS_ACCESS_TOKEN remains for Ads only. Publishing stays approval-gated.',
      testable: true,
      missing: [
        ...(!openai ? ['OPENAI_API_KEY'] : []),
        ...(!isInstagramConfigured()
          ? ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID']
          : liveInstagramPublishingEnabled()
            ? []
            : ['LIVE_INSTAGRAM_PUBLISHING_ENABLED']),
      ],
    },
    {
      id: 'brave',
      name: 'Brave Search',
      status: isBraveSearchConfigured() ? 'connected' : 'not_connected',
      summary: isBraveSearchConfigured()
        ? 'Live web research is available within cost caps.'
        : 'Live web research unavailable.',
      can_do: isBraveSearchConfigured() ? ['Objective web research'] : [],
      cannot_do: isBraveSearchConfigured() ? [] : ['Competitor / market web research'],
      configure_hint: isBraveSearchConfigured()
        ? null
        : 'Set BRAVE_SEARCH_API_KEY on the server. Optional: JARVIS_WEB_SEARCH_PROVIDER=brave.',
      testable: true,
      missing: isBraveSearchConfigured() ? [] : ['BRAVE_SEARCH_API_KEY'],
    },
    {
      id: 'video',
      name: 'Video Provider',
      status: isVideoProviderConfigured() ? 'connected' : 'not_connected',
      summary: isVideoProviderConfigured()
        ? `Provider ${video.name} is ready. Publish still needs approval.`
        : 'Video rendering unavailable.',
      can_do: isVideoProviderConfigured()
        ? ['Queue gym footage edits', 'Check job status', 'Receive Shotstack webhooks']
        : [],
      cannot_do: isVideoProviderConfigured()
        ? ['Publish without approval']
        : ['Render Reels', 'Remove silence / captions automatically'],
      configure_hint: isVideoProviderConfigured()
        ? null
        : 'Set VIDEO_EDIT_PROVIDER=shotstack, VIDEO_EDIT_API_KEY, and VIDEO_EDIT_WEBHOOK_URL=https://app.lurvox.in/api/admin/jarvis/video-webhook (not www.lurvox.in).',
      testable: true,
      missing: isVideoProviderConfigured()
        ? []
        : ['VIDEO_EDIT_PROVIDER', 'VIDEO_EDIT_API_KEY', 'VIDEO_EDIT_WEBHOOK_URL'],
    },
    (() => {
      const rt = describeRealtimeCapability()
      const mapStatus = (): IntegrationStatus => {
        if (rt.status === 'CONNECTED') return 'connected'
        if (rt.status === 'DISABLED') return 'disabled'
        if (rt.status === 'NOT_CONFIGURED') return 'not_connected'
        if (rt.status === 'DEGRADED' || rt.status === 'ERROR') return 'error'
        return 'partial'
      }
      return {
        id: 'jarvis_realtime',
        name: 'Jarvis Realtime Voice',
        status: mapStatus(),
        summary: rt.note,
        can_do:
          rt.modalities.voice_input === 'CONNECTED'
            ? [
                'Push-to-talk voice input',
                'Spoken replies (optional)',
                'Same orchestrator as text chat',
              ]
            : ['Text Jarvis (always)'],
        cannot_do: [
          'Bypass approval / cost / live Meta / Instagram publish',
          'Always-listening microphone',
          'Wake word',
          'Raw audio storage',
        ],
        configure_hint:
          rt.missing.length > 0
            ? `Configured through server environment: ${rt.missing.join(', ')}. Never paste secrets into the UI.`
            : rt.enabled
              ? null
              : 'Set JARVIS_REALTIME_ENABLED=true and OPENAI_API_KEY on the server to enable push-to-talk.',
        testable: false,
        missing: rt.missing,
      } satisfies IntegrationCard
    })(),
  ]
}

const OPTIONAL_INTEGRATIONS = new Set(['brave', 'video', 'jarvis_realtime'])

export function buildSystemHealth(cards: IntegrationCard[]): SystemHealth {
  const core = cards.filter((c) => c.id === 'openai' || c.id === 'supabase')
  const coreDown = core.some((c) => c.status === 'not_connected' || c.status === 'error')
  const connected = cards.filter((c) => c.status === 'connected')
  const attentionCards = cards.filter(
    (c) => c.status === 'not_connected' || c.status === 'error' || c.status === 'partial'
  )
  const criticalAttention = attentionCards.filter((c) => !OPTIONAL_INTEGRATIONS.has(c.id))
  const counts = {
    connected_count: connected.length,
    total_count: cards.length,
    attention_count: attentionCards.length,
  }

  if (coreDown) {
    return {
      level: 'action_required',
      label: 'Action required',
      explanation: `${counts.connected_count}/${counts.total_count} systems connected. Core systems need attention.`,
      ...counts,
    }
  }

  const needsAttention = counts.attention_count > 0
  const critical = criticalAttention.length > 0
  return {
    level: critical ? 'partial' : needsAttention ? 'partial' : 'operational',
    label: 'Operational',
    explanation: needsAttention
      ? `${counts.connected_count}/${counts.total_count} systems connected. ${counts.attention_count} ${counts.attention_count === 1 ? 'system needs' : 'systems need'} attention.`
      : `${counts.connected_count}/${counts.total_count} systems connected. No critical issues.`,
    ...counts,
  }
}

export async function buildCapabilities(): Promise<Record<CapabilityGroup, CapabilityItem[]>> {
  ensureJarvisToolsRegistered()
  const cards = await listIntegrationCards()
  const byId = new Map(cards.map((c) => [c.id, c]))
  const groups: Record<CapabilityGroup, CapabilityItem[]> = {
    WORKING: [],
    'WAITING FOR INTEGRATION': [],
    'REQUIRES APPROVAL': [],
    BLOCKED: [],
  }

  for (const name of FORBIDDEN_TOOL_NAMES) {
    groups.BLOCKED.push({
      title: humanToolLabel(name),
      detail: 'Blocked by policy. Jarvis cannot change permissions, raise its budget, disable audit, or enable live Meta.',
      group: 'BLOCKED',
      tool: name,
    })
  }

  for (const tool of listTools()) {
    if (FORBIDDEN_TOOL_NAMES.has(tool.name)) continue
    const family = toolFamily(tool.name)
    const integrationId =
      family === 'Meta Ads'
        ? 'meta'
        : family === 'Shopify'
          ? 'shopify'
          : family === 'Research'
            ? 'brave'
            : family === 'Video'
              ? 'video'
              : family === 'Instagram'
                ? 'instagram'
                : tool.name.startsWith('creatives.')
                  ? 'openai'
                  : null
    const integration = integrationId ? byId.get(integrationId) : undefined
    const perm = await evaluateToolPermission({ toolName: tool.name, source: 'chat' })

    if (!perm.allowed) {
      groups.BLOCKED.push({
        title: humanToolLabel(tool.name),
        detail: perm.reason,
        group: 'BLOCKED',
        tool: tool.name,
      })
      continue
    }

    const waiting =
      integration && (integration.status === 'not_connected' || integration.status === 'error')

    if (waiting) {
      groups['WAITING FOR INTEGRATION'].push({
        title: humanToolLabel(tool.name),
        detail: integration.summary,
        group: 'WAITING FOR INTEGRATION',
        tool: tool.name,
      })
      continue
    }

    if (perm.mode === 'require_approval' || tool.riskClass === 'SIGNIFICANT') {
      groups['REQUIRES APPROVAL'].push({
        title: humanToolLabel(tool.name),
        detail: perm.reason,
        group: 'REQUIRES APPROVAL',
        tool: tool.name,
      })
      continue
    }

    groups.WORKING.push({
      title: humanToolLabel(tool.name),
      detail: tool.description,
      group: 'WORKING',
      tool: tool.name,
    })
  }

  if (byId.get('instagram')?.status === 'partial') {
    groups['WAITING FOR INTEGRATION'].push({
      title: 'Live Instagram Graph publish',
      detail:
        'Prepare drafts and request approval anytime. Live Graph publish also needs LIVE_INSTAGRAM_PUBLISHING_ENABLED=true.',
      group: 'WAITING FOR INTEGRATION',
    })
  }

  return groups
}

export async function testIntegration(id: string): Promise<{
  ok: boolean
  status: IntegrationStatus
  message: string
}> {
  if (id === 'openai') {
    const ok = openaiConfigured()
    return {
      ok,
      status: ok ? 'connected' : 'not_connected',
      message: ok ? 'OPENAI_API_KEY is present on the server.' : 'OPENAI_API_KEY is not configured.',
    }
  }
  if (id === 'supabase') {
    if (!supabaseConfigured()) {
      return { ok: false, status: 'not_connected', message: 'Supabase URL or service role key is missing.' }
    }
    try {
      const admin = createAdminClient()
      const { error } = await admin.from('jarvis_settings').select('key').limit(1)
      if (error) return { ok: false, status: 'error', message: 'Supabase connected but query failed.' }
      return { ok: true, status: 'connected', message: 'Supabase responded. No secrets returned.' }
    } catch {
      return { ok: false, status: 'error', message: 'Supabase client could not be created.' }
    }
  }
  if (id === 'meta') {
    const meta = await loadMetaIntegrationStatus()
    if (!meta.configured) {
      return { ok: false, status: 'not_connected', message: 'Meta Ads credentials are not configured.' }
    }
    return {
      ok: !meta.lastSyncError,
      status: meta.lastSyncError ? 'error' : 'connected',
      message: meta.lastSyncError
        ? 'Meta is configured but the last sync reported an error.'
        : `Meta Ads connected for account ${meta.adAccountId}. Live execution is ${liveMetaExecutionEnabled() ? 'ON' : 'OFF'}${
            meta.lastSyncAt ? `. Last sync ${meta.lastSyncAt}` : '. lastSyncAt is null — sync has not completed successfully.'
          }.`,
    }
  }
  if (id === 'shopify') {
    const result = await shopifyTestConnection()
    return {
      ok: result.ok,
      status: result.status,
      message: result.message,
    }
  }
  if (id === 'brave') {
    const ok = isBraveSearchConfigured()
    return {
      ok,
      status: ok ? 'connected' : 'not_connected',
      message: ok
        ? 'BRAVE_SEARCH_API_KEY is present.'
        : 'Live web research unavailable — BRAVE_SEARCH_API_KEY is not configured.',
    }
  }
  if (id === 'video') {
    const ok = isVideoProviderConfigured()
    return {
      ok,
      status: ok ? 'connected' : 'not_connected',
      message: ok
        ? 'Video provider is configured.'
        : 'Video rendering unavailable — no video provider is configured.',
    }
  }
  if (id === 'instagram') {
    const status = instagramStatus()
    const openai = openaiConfigured()
    if (!openai && !status.ok) {
      return {
        ok: false,
        status: 'not_connected',
        message: 'Instagram ideas need OpenAI. Graph credentials are also missing.',
      }
    }
    if (status.ok) {
      return {
        ok: true,
        status: liveInstagramPublishingEnabled() ? 'connected' : 'partial',
        message: status.note,
      }
    }
    return {
      ok: openai,
      status: openai ? 'partial' : 'not_connected',
      message: openai
        ? 'Idea generation/planning available. Instagram Graph account not fully configured.'
        : 'Instagram ideas need OpenAI. Publishing is gated.',
    }
  }
  return { ok: false, status: 'not_connected', message: 'Unknown integration.' }
}

export async function buildOperatorSystem() {
  const integrations = await listIntegrationCards()
  const health = buildSystemHealth(integrations)
  const capabilities = await buildCapabilities()
  return { integrations, health, capabilities }
}
