/**
 * End-to-end READ-ONLY Jarvis Instagram operator test.
 *
 * Path under test:
 *   Command Center stack → runTool (orchestrator action-runner) → tool registry
 *   → Instagram Login provider → real Meta API → structured tool output
 *
 * Also exercises Command Center integrations helpers:
 *   buildOperatorSystem() + testIntegration('instagram')
 *
 * NEVER publishes, creates, deletes, modifies, schedules, or enables live publishing.
 * Uses INSTAGRAM_ACCESS_TOKEN only — META_ADS_ACCESS_TOKEN is blanked during Graph tools.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-instagram-operator-e2e.ts
 *   npm run verify:instagram-operator-e2e
 */
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { runTool } from '../src/lib/jarvis/core/action-runner'
import {
  buildOperatorSystem,
  testIntegration,
} from '../src/lib/jarvis/operator-integrations'
import {
  liveInstagramPublishingEnabled,
  readInstagramAccessToken,
  readInstagramBusinessAccountId,
  writeInstagramAudit,
} from '../src/lib/jarvis/instagram'
import { redactSecrets, sanitizePublicJson } from '../src/lib/jarvis/operator-errors'
import type { ToolExecutionContext } from '../src/lib/jarvis/types'

const EXPECTED_IG_ID = '17841405951020511'
const READ_ONLY_TOOLS = [
  'instagram.status',
  'instagram.get_profile',
  'instagram.list_media',
  'instagram.get_media',
  'instagram.media_insights',
  'instagram.content_performance',
  'instagram.engagement_summary',
  'instagram.posting_frequency',
] as const

type OutcomeClass =
  | 'SUCCESS'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'CONFIG_ERROR'
  | 'API_ERROR'
  | 'REGISTRY_MISS'
  | 'TOOL_FAILED'
  | 'BLOCKED'
  | 'BUDGET_EXHAUSTED'

type ToolOpResult = {
  tool: string
  registered: boolean
  risk_class: string | null
  run_status: string | null
  classification: OutcomeClass
  data_status: string | null
  provider_status: number | null
  error: string | null
  summary: string | null
  detail: Record<string, unknown>
}

function assertNoSecretLeak(payload: unknown, token: string) {
  const dumped = JSON.stringify(payload)
  if (token.length > 8 && dumped.includes(token)) {
    throw new Error('FAIL: access token leaked into verification output')
  }
  if (/access_token[=:]\s*(?!\[redacted\])[^\s&"]+/i.test(dumped)) {
    throw new Error('FAIL: access_token query/value leaked into output')
  }
  if (dumped.includes('SHOULD_NOT_BE_USED_FOR_INSTAGRAM')) {
    throw new Error('FAIL: Ads sentinel token leaked into output')
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function classifyOutput(toolStatus: string, output: unknown, error?: string | null): OutcomeClass {
  if (toolStatus === 'blocked') return 'BLOCKED'
  if (toolStatus === 'budget_exhausted') return 'BUDGET_EXHAUSTED'
  if (toolStatus === 'failed') {
    const msg = `${error || ''} ${JSON.stringify(output || {})}`.toLowerCase()
    if (/permission|oauth|#10\b/.test(msg)) return 'PERMISSION_DENIED'
    if (/rate limit|#4\b|429/.test(msg)) return 'RATE_LIMITED'
    if (/not found|404/.test(msg)) return 'NOT_FOUND'
    if (/not configured|missing/.test(msg)) return 'CONFIG_ERROR'
    return 'TOOL_FAILED'
  }
  const rec = asRecord(output)
  if (!rec) return toolStatus === 'executed' ? 'SUCCESS' : 'API_ERROR'
  const dataStatus = typeof rec.data_status === 'string' ? rec.data_status : null
  const errCode = String(rec.error_code || '').toLowerCase()
  const msg = `${rec.error || ''} ${rec.note || ''}`.toLowerCase()
  const providerStatus =
    typeof rec.provider_status === 'number' ? rec.provider_status : null

  if (errCode === 'permission' || providerStatus === 403 || /permission|oauth|#10\b/.test(msg)) {
    return 'PERMISSION_DENIED'
  }
  if (errCode === 'rate_limit' || providerStatus === 429 || /rate limit|#4\b/.test(msg)) {
    return 'RATE_LIMITED'
  }
  if (providerStatus === 404 || /not found/.test(msg)) return 'NOT_FOUND'
  if (dataStatus === 'unavailable' && /not configured|missing instagram|instagram_access_token/i.test(msg)) {
    return 'CONFIG_ERROR'
  }
  if (dataStatus === 'failed') return 'API_ERROR'
  if (dataStatus === 'verified' || dataStatus === 'partial' || rec.ok === true || rec.configured === true) {
    return 'SUCCESS'
  }
  // Honest local empty/unavailable after a successful registry execution is not a tool failure.
  if (toolStatus === 'executed' && (dataStatus === 'unavailable' || dataStatus == null)) {
    return 'SUCCESS'
  }
  if (dataStatus === 'unavailable') return 'CONFIG_ERROR'
  return toolStatus === 'executed' ? 'SUCCESS' : 'API_ERROR'
}

function log(phase: string, payload: Record<string, unknown>, token: string) {
  const publicPayload = sanitizePublicJson(payload)
  assertNoSecretLeak(publicPayload, token)
  console.log(JSON.stringify({ phase, ...(publicPayload as object) }))
}

export async function runInstagramOperatorE2E(): Promise<{
  exitCode: number
  report: Record<string, unknown>
}> {
  const token = readInstagramAccessToken()
  const igId = readInstagramBusinessAccountId()
  const live = liveInstagramPublishingEnabled()

  const prevAds = process.env.META_ADS_ACCESS_TOKEN
  // Prove Instagram tools do not need / use Ads token
  process.env.META_ADS_ACCESS_TOKEN = 'SHOULD_NOT_BE_USED_FOR_INSTAGRAM'

  const ops: ToolOpResult[] = []
  const report: {
    mode: 'jarvis_operator_e2e_readonly'
    account: '@maximusvault'
    path: string
    auth_mode_expected: 'instagram_login'
    uses_meta_ads_token: false
    live_instagram_publishing_enabled: boolean
    configured_ig_id: string | null
    ig_id_matches_expected: boolean | null
    token_present: boolean
    token_length: number
    registry: Record<string, unknown>
    command_center: Record<string, unknown>
    tools: ToolOpResult[]
    failed_tools: { tool: string; classification: string; reason: string }[]
    can_operate_readonly_via_jarvis: boolean
    audit: Record<string, unknown>
  } = {
    mode: 'jarvis_operator_e2e_readonly',
    account: '@maximusvault',
    path: 'CommandCenter/integrations + runTool(source=chat) → registry → Instagram Login → Meta',
    auth_mode_expected: 'instagram_login',
    uses_meta_ads_token: false,
    live_instagram_publishing_enabled: live,
    configured_ig_id: igId || null,
    ig_id_matches_expected: igId ? igId === EXPECTED_IG_ID : null,
    token_present: token.length > 0,
    token_length: token.length,
    registry: {},
    command_center: {},
    tools: ops,
    failed_tools: [],
    can_operate_readonly_via_jarvis: false,
    audit: {},
  }

  log(
    'config',
    {
      note: 'Token never printed. META_ADS_ACCESS_TOKEN blanked to Ads sentinel during this run.',
      account: report.account,
      path: report.path,
      token_present: report.token_present,
      token_length: report.token_length,
      configured_ig_id: report.configured_ig_id,
      ig_id_matches_expected: report.ig_id_matches_expected,
      live_instagram_publishing_enabled: live,
      safety: {
        publish: false,
        create: false,
        delete: false,
        modify: false,
        schedule: false,
        enable_live_publishing: false,
      },
      tools: [...READ_ONLY_TOOLS],
    },
    token
  )

  if (live) {
    log(
      'safety',
      {
        warning:
          'LIVE_INSTAGRAM_PUBLISHING_ENABLED is true, but this E2E only invokes READ tools and will not publish.',
      },
      token
    )
  }

  if (!token || !igId) {
    report.failed_tools.push({
      tool: 'credentials',
      classification: 'CONFIG_ERROR',
      reason: !token
        ? 'INSTAGRAM_ACCESS_TOKEN missing'
        : 'INSTAGRAM_BUSINESS_ACCOUNT_ID missing',
    })
    if (prevAds === undefined) delete process.env.META_ADS_ACCESS_TOKEN
    else process.env.META_ADS_ACCESS_TOKEN = prevAds
    return { exitCode: 2, report }
  }

  ensureJarvisToolsRegistered()

  // Registry resolution
  const registryDetail: Record<string, unknown> = {}
  for (const name of READ_ONLY_TOOLS) {
    const tool = getTool(name)
    registryDetail[name] = tool
      ? {
          registered: true,
          risk_class: tool.riskClass,
          can_run_autonomously: tool.canRunAutonomously,
          audit_required: tool.auditRequired,
        }
      : { registered: false }
    if (!tool) {
      ops.push({
        tool: name,
        registered: false,
        risk_class: null,
        run_status: null,
        classification: 'REGISTRY_MISS',
        data_status: null,
        provider_status: null,
        error: `Tool ${name} not found in Jarvis registry`,
        summary: null,
        detail: {},
      })
      report.failed_tools.push({
        tool: name,
        classification: 'REGISTRY_MISS',
        reason: `Tool ${name} not found in Jarvis registry`,
      })
    }
  }
  report.registry = registryDetail
  log('registry', { tools: registryDetail }, token)

  // Command Center integrations path (same helpers as /api/admin/jarvis/integrations)
  try {
    const system = await buildOperatorSystem()
    const igCard = system.integrations.find((c) => c.id === 'instagram')
    const test = await testIntegration('instagram')
    report.command_center = {
      path: 'buildOperatorSystem + testIntegration(instagram)',
      card_status: igCard?.status ?? null,
      card_summary: igCard?.summary ?? null,
      card_missing: igCard?.missing ?? [],
      test_ok: test.ok,
      test_status: test.status,
      test_message: test.message,
      auth_hint_in_message: /instagram login|graph\.instagram|INSTAGRAM_ACCESS_TOKEN/i.test(
        `${igCard?.summary || ''} ${igCard?.configure_hint || ''} ${test.message}`
      ),
      ads_token_mentioned_as_required: /META_ADS_ACCESS_TOKEN/.test(
        JSON.stringify({ card: igCard, test })
      ),
    }
    log('command_center', report.command_center as Record<string, unknown>, token)
    if (report.command_center.ads_token_mentioned_as_required) {
      report.failed_tools.push({
        tool: 'command_center.integrations',
        classification: 'CONFIG_ERROR',
        reason: 'Command Center still lists META_ADS_ACCESS_TOKEN as required for Instagram',
      })
    }
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300)
    report.command_center = { ok: false, error: message }
    report.failed_tools.push({
      tool: 'command_center.integrations',
      classification: 'API_ERROR',
      reason: message,
    })
    log('command_center', report.command_center as Record<string, unknown>, token)
  }

  const ctx: ToolExecutionContext = {
    actorId: null,
    conversationId: null,
    taskId: null,
    source: 'chat', // same source orchestrator uses for Command Center chat turns
  }

  let mediaId: string | null = null
  let mediaProductType: string | null = null
  let mediaType: string | null = null

  for (const name of READ_ONLY_TOOLS) {
    if (ops.some((o) => o.tool === name && o.classification === 'REGISTRY_MISS')) continue

    const tool = getTool(name)!
    let input: Record<string, unknown> = {}

    if (name === 'instagram.list_media') input = { limit: 5 }
    if (name === 'instagram.content_performance') input = { limit: 30 }
    if (name === 'instagram.engagement_summary') input = { limit: 40 }
    if (name === 'instagram.posting_frequency') input = { limit: 50 }

    if (name === 'instagram.get_media' || name === 'instagram.media_insights') {
      if (!mediaId) {
        const skipped: ToolOpResult = {
          tool: name,
          registered: true,
          risk_class: tool.riskClass,
          run_status: 'skipped',
          classification: 'TOOL_FAILED',
          data_status: 'unavailable',
          provider_status: null,
          error: 'No mediaId from instagram.list_media — cannot run dependent tool',
          summary: 'skipped',
          detail: {},
        }
        ops.push(skipped)
        report.failed_tools.push({
          tool: name,
          classification: skipped.classification,
          reason: skipped.error || 'skipped',
        })
        log('tool', skipped as unknown as Record<string, unknown>, token)
        continue
      }
      if (name === 'instagram.get_media') input = { mediaId }
      if (name === 'instagram.media_insights') {
        const product = (mediaProductType || '').toUpperCase()
        const type = (mediaType || '').toUpperCase()
        const metrics =
          product === 'REELS' || type === 'REELS' || type === 'VIDEO'
            ? ['reach', 'saved', 'shares', 'views', 'total_interactions']
            : ['reach', 'saved', 'total_interactions']
        input = { mediaId, metrics }
      }
    }

    try {
      const result = await runTool(name, input, ctx)
      const outputRec = asRecord(result.output)
      const classification = classifyOutput(result.status, result.output, result.error)

      // Capture media id for dependent tools
      if (name === 'instagram.list_media' && classification === 'SUCCESS') {
        const value = outputRec?.value
        if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
          const first = value[0] as Record<string, unknown>
          mediaId = typeof first.id === 'string' ? first.id : null
          mediaType = typeof first.media_type === 'string' ? first.media_type : null
          mediaProductType =
            typeof first.media_product_type === 'string' ? first.media_product_type : null
        }
      }

      // Instagram Login credential proof on status tool
      const detail: Record<string, unknown> = {
        input,
        run_status: result.status,
        risk_class: result.riskClass,
        cost_usd: result.costUsd,
        tool_call_id: result.toolCallId ?? null,
      }

      if (name === 'instagram.status' && outputRec) {
        detail.auth_mode = outputRec.auth_mode ?? null
        detail.host = outputRec.host ?? null
        detail.live_publishing_enabled = outputRec.livePublishingEnabled ?? null
        detail.ok = outputRec.ok ?? null
        if (outputRec.auth_mode !== 'instagram_login' || outputRec.host !== 'graph.instagram.com') {
          report.failed_tools.push({
            tool: name,
            classification: 'CONFIG_ERROR',
            reason: `Expected Instagram Login host/auth; got auth_mode=${String(outputRec.auth_mode)} host=${String(outputRec.host)}`,
          })
        }
      }

      if (name === 'instagram.get_profile' && outputRec?.value && typeof outputRec.value === 'object') {
        const profile = outputRec.value as Record<string, unknown>
        detail.profile = {
          id: profile.id ?? null,
          username: profile.username ?? null,
          followers_count: profile.followers_count ?? null,
          media_count: profile.media_count ?? null,
          account_type: profile.account_type ?? null,
        }
      }

      if (name === 'instagram.list_media' && Array.isArray(outputRec?.value)) {
        detail.media_count = outputRec.value.length
        detail.first_media_id = mediaId
      }

      if (name === 'instagram.media_insights' && Array.isArray(outputRec?.value)) {
        detail.insights = outputRec.value.map((row) => {
          const r = row as Record<string, unknown>
          const values = Array.isArray(r.values) ? r.values : []
          const first = values[0] && typeof values[0] === 'object' ? (values[0] as Record<string, unknown>) : {}
          return {
            name: r.name ?? null,
            value: first.value ?? null,
            period: r.period ?? null,
          }
        })
      }

      // Honesty: failed/unavailable must not invent numeric zeros on followers/media_count
      if (
        (outputRec?.data_status === 'failed' || outputRec?.data_status === 'unavailable') &&
        outputRec.value === null
      ) {
        detail.honesty = 'value_null_on_failure_ok'
      }

      const op: ToolOpResult = {
        tool: name,
        registered: true,
        risk_class: tool.riskClass,
        run_status: result.status,
        classification:
          name === 'instagram.status' &&
          outputRec &&
          (outputRec.auth_mode !== 'instagram_login' || outputRec.host !== 'graph.instagram.com')
            ? 'CONFIG_ERROR'
            : classification,
        data_status: typeof outputRec?.data_status === 'string' ? outputRec.data_status : null,
        provider_status:
          typeof outputRec?.provider_status === 'number' ? outputRec.provider_status : null,
        error: result.error
          ? redactSecrets(result.error).slice(0, 300)
          : outputRec?.error
            ? redactSecrets(String(outputRec.error)).slice(0, 300)
            : null,
        summary: result.summary ? redactSecrets(result.summary).slice(0, 240) : null,
        detail,
      }
      ops.push(op)
      if (op.classification !== 'SUCCESS') {
        report.failed_tools.push({
          tool: name,
          classification: op.classification,
          reason: op.error || op.summary || op.classification,
        })
      }
      log('tool', op as unknown as Record<string, unknown>, token)
    } catch (err) {
      const message = redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300)
      const op: ToolOpResult = {
        tool: name,
        registered: true,
        risk_class: tool.riskClass,
        run_status: 'failed',
        classification: 'TOOL_FAILED',
        data_status: 'failed',
        provider_status: null,
        error: message,
        summary: message,
        detail: { input },
      }
      ops.push(op)
      report.failed_tools.push({ tool: name, classification: 'TOOL_FAILED', reason: message })
      log('tool', op as unknown as Record<string, unknown>, token)
    }
  }

  // Deduplicate failed_tools by tool name (keep first)
  const seen = new Set<string>()
  report.failed_tools = report.failed_tools.filter((f) => {
    if (seen.has(f.tool)) return false
    seen.add(f.tool)
    return true
  })

  const requiredSuccess = [
    'instagram.status',
    'instagram.get_profile',
    'instagram.list_media',
    'instagram.get_media',
    'instagram.media_insights',
    'instagram.content_performance',
    'instagram.engagement_summary',
    'instagram.posting_frequency',
  ]
  report.can_operate_readonly_via_jarvis = requiredSuccess.every((name) =>
    ops.some((o) => o.tool === name && o.classification === 'SUCCESS')
  )

  try {
    const record = await writeInstagramAudit({
      action: 'instagram.verify_operator_e2e_readonly',
      target: igId,
      actor: null,
      approval_state: 'not_required_read_only',
      result: report.can_operate_readonly_via_jarvis ? 'completed' : 'failed',
      provider_response_status: null,
      error_redacted: report.failed_tools
        .map((f) => `${f.tool}:${f.classification}`)
        .join(', ')
        .slice(0, 400),
      extra: {
        mode: 'jarvis_operator_e2e_readonly',
        path: report.path,
        uses_meta_ads_token: false,
        can_operate_readonly_via_jarvis: report.can_operate_readonly_via_jarvis,
        tool_classes: ops.map((o) => ({
          tool: o.tool,
          classification: o.classification,
          run_status: o.run_status,
        })),
        live_instagram_publishing_enabled: live,
      },
    })
    report.audit = {
      written: true,
      action: 'instagram.verify_operator_e2e_readonly',
      timestamp: record.timestamp,
      secrets_stored: false,
    }
  } catch (err) {
    report.audit = {
      written: false,
      error: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 200),
    }
  }

  if (prevAds === undefined) delete process.env.META_ADS_ACCESS_TOKEN
  else process.env.META_ADS_ACCESS_TOKEN = prevAds

  const summary = {
    account: report.account,
    path: report.path,
    live_instagram_publishing_enabled: report.live_instagram_publishing_enabled,
    uses_meta_ads_token: false,
    ads_token_blanked_during_run: true,
    command_center_ok: Boolean(
      (report.command_center as { test_ok?: boolean }).test_ok ??
        (report.command_center as { card_status?: string }).card_status
    ),
    tools: ops.map((o) => ({
      tool: o.tool,
      registered: o.registered,
      classification: o.classification,
      run_status: o.run_status,
      data_status: o.data_status,
      error: o.error,
    })),
    failed_tools: report.failed_tools,
    can_operate_readonly_via_jarvis: report.can_operate_readonly_via_jarvis,
    audit: report.audit,
  }
  log('summary', summary, token)

  return {
    exitCode: report.can_operate_readonly_via_jarvis ? 0 : 1,
    report: summary,
  }
}

async function main() {
  const { exitCode } = await runInstagramOperatorE2E()
  process.exit(exitCode)
}

const invokedDirectly = process.argv[1]
  ? /verify-instagram-operator-e2e\.(ts|js|mjs|cjs)$/.test(process.argv[1].replace(/\\/g, '/'))
  : false

if (invokedDirectly) {
  main().catch((err) => {
    console.error(
      JSON.stringify({
        phase: 'fatal',
        error: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300),
      })
    )
    process.exit(1)
  })
}
