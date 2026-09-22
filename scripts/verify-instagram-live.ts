/**
 * READ-ONLY live Instagram Login integration test (@maximusvault).
 *
 * Usage:
 *   npm run verify:instagram-live
 *   npm run verify-instagram-live
 *
 * Exercises Jarvis Instagram Login provider against real Meta API:
 *   1. getInstagramProfile
 *   2. listInstagramMedia
 *   3. getInstagramMedia (one item)
 *   4. getInstagramMediaInsights (if scopes allow)
 *   5. localContentPerformance
 *   6. instagramStatus + health check
 *
 * NEVER publishes, creates, deletes, modifies, schedules, or enables
 * LIVE_INSTAGRAM_PUBLISHING_ENABLED. Never prints access tokens.
 * Does NOT use META_ADS_ACCESS_TOKEN.
 */
import { MetaApiError } from '../src/lib/ai-marketing/meta/client'
import {
  getInstagramProfile,
  listInstagramMedia,
  getInstagramMedia,
  getInstagramMediaInsights,
  localContentPerformance,
  instagramStatus,
  liveInstagramPublishingEnabled,
  readInstagramAccessToken,
  readInstagramBusinessAccountId,
  writeInstagramAudit,
} from '../src/lib/jarvis/instagram'
import { runHealthChecks } from '../src/lib/jarvis/diagnostics/health-checks'
import { assertAiBudgetAvailable, recordCostUsage } from '../src/lib/jarvis/cost/usage'
import { redactSecrets, sanitizePublicJson } from '../src/lib/jarvis/operator-errors'

const EXPECTED_IG_ID = '17841405951020511'
const MEDIA_LIMIT = 5

type OutcomeClass =
  | 'SUCCESS'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'CONFIG_ERROR'
  | 'API_ERROR'
  | 'UNAVAILABLE'
  | 'SKIPPED'

type OpResult = {
  operation: string
  classification: OutcomeClass
  data_status: string | null
  provider_status: number | null
  error_code: string | number | null
  error_message: string | null
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
  if (/Bearer\s+(?!\[redacted\])\S+/i.test(dumped)) {
    throw new Error('FAIL: Bearer token leaked into output')
  }
}

function classifyFromEnvelope(env: {
  data_status?: string
  error?: string | null
  error_code?: string | null
  provider_status?: number | null
  note?: string | null
}): OutcomeClass {
  const status = env.provider_status ?? null
  const code = (env.error_code || '').toLowerCase()
  const msg = `${env.error || ''} ${env.note || ''}`.toLowerCase()

  if (env.data_status === 'unavailable' && /not configured|missing/i.test(msg)) {
    return 'CONFIG_ERROR'
  }
  if (code === 'permission' || status === 403 || /permission|oauth|#10\b/.test(msg)) {
    return 'PERMISSION_DENIED'
  }
  if (code === 'rate_limit' || status === 429 || /rate limit|#4\b/.test(msg)) {
    return 'RATE_LIMITED'
  }
  if (status === 404 || /not found|#100\b.*exist|does not exist/.test(msg)) {
    return 'NOT_FOUND'
  }
  if (env.data_status === 'verified' || env.data_status === 'partial') {
    return 'SUCCESS'
  }
  if (env.data_status === 'unavailable') return 'UNAVAILABLE'
  return 'API_ERROR'
}

function classifyThrown(err: unknown): {
  classification: OutcomeClass
  provider_status: number | null
  error_code: string | number | null
  error_message: string | null
} {
  if (err instanceof MetaApiError) {
    const body = err.body as { code?: number; message?: string } | undefined
    const msg = redactSecrets(body?.message || err.message).slice(0, 300)
    const status = err.status ?? null
    const code = body?.code ?? null
    if (status === 429 || code === 4) {
      return { classification: 'RATE_LIMITED', provider_status: status, error_code: code, error_message: msg }
    }
    if (status === 403 || code === 10 || /permission|oauth/i.test(msg)) {
      return {
        classification: 'PERMISSION_DENIED',
        provider_status: status,
        error_code: code,
        error_message: msg,
      }
    }
    if (status === 404) {
      return { classification: 'NOT_FOUND', provider_status: status, error_code: code, error_message: msg }
    }
    return { classification: 'API_ERROR', provider_status: status, error_code: code, error_message: msg }
  }
  return {
    classification: 'API_ERROR',
    provider_status: null,
    error_code: 'unknown',
    error_message: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300),
  }
}

function logOp(op: OpResult, token: string) {
  const publicOp = sanitizePublicJson(op)
  assertNoSecretLeak(publicOp, token)
  console.log(JSON.stringify({ phase: 'operation', ...(publicOp as object) }))
}

async function main() {
  const token = readInstagramAccessToken()
  const igId = readInstagramBusinessAccountId()
  const live = liveInstagramPublishingEnabled()
  const adsTokenPresent = Boolean(process.env.META_ADS_ACCESS_TOKEN?.trim())

  const ops: OpResult[] = []
  const report: {
    mode: 'read_only_live'
    account: '@maximusvault'
    auth_mode: 'instagram_login'
    host: 'graph.instagram.com'
    uses_meta_ads_token: false
    live_instagram_publishing_enabled: boolean
    configured_ig_id: string | null
    expected_ig_id: string
    ig_id_matches_expected: boolean | null
    token_present: boolean
    token_length: number
    profile: Record<string, unknown> | null
    media_count: number | null
    media_item_ok: boolean
    insights_ok: boolean
    content_performance_ok: boolean
    status_health_ok: boolean
    missing_permissions_or_scopes: string[]
    can_operate_readonly: boolean
    operations: OpResult[]
    budget: Record<string, unknown>
    audit: Record<string, unknown>
  } = {
    mode: 'read_only_live',
    account: '@maximusvault',
    auth_mode: 'instagram_login',
    host: 'graph.instagram.com',
    uses_meta_ads_token: false,
    live_instagram_publishing_enabled: live,
    configured_ig_id: igId || null,
    expected_ig_id: EXPECTED_IG_ID,
    ig_id_matches_expected: igId ? igId === EXPECTED_IG_ID : null,
    token_present: token.length > 0,
    token_length: token.length,
    profile: null,
    media_count: null,
    media_item_ok: false,
    insights_ok: false,
    content_performance_ok: false,
    status_health_ok: false,
    missing_permissions_or_scopes: [],
    can_operate_readonly: false,
    operations: ops,
    budget: {},
    audit: {},
  }

  console.log(
    JSON.stringify({
      phase: 'config',
      note: 'Token value never printed. Instagram Login only — META_ADS_ACCESS_TOKEN not used.',
      account: report.account,
      auth_mode: report.auth_mode,
      host: report.host,
      token_present: report.token_present,
      token_length: report.token_length,
      configured_ig_id: report.configured_ig_id,
      expected_ig_id: report.expected_ig_id,
      ig_id_matches_expected: report.ig_id_matches_expected,
      live_instagram_publishing_enabled: live,
      meta_ads_token_present_but_unused: adsTokenPresent,
      safety: {
        publish: false,
        create: false,
        delete: false,
        modify: false,
        schedule: false,
        enable_live_publishing: false,
      },
      operations: [
        'getInstagramProfile',
        'listInstagramMedia',
        'getInstagramMedia',
        'getInstagramMediaInsights',
        'localContentPerformance',
        'instagramStatus + health',
      ],
    })
  )

  if (live) {
    console.log(
      JSON.stringify({
        phase: 'safety',
        warning:
          'LIVE_INSTAGRAM_PUBLISHING_ENABLED is true, but this script is READ-ONLY and will not publish.',
      })
    )
  }

  if (!token) {
    const op: OpResult = {
      operation: 'credentials',
      classification: 'CONFIG_ERROR',
      data_status: 'unavailable',
      provider_status: null,
      error_code: 'INSTAGRAM_ACCESS_TOKEN',
      error_message: 'INSTAGRAM_ACCESS_TOKEN is not set',
      detail: { missing: ['INSTAGRAM_ACCESS_TOKEN'] },
    }
    ops.push(op)
    logOp(op, '')
    await finish(report, 2)
    return 2
  }

  if (!igId) {
    const op: OpResult = {
      operation: 'credentials',
      classification: 'CONFIG_ERROR',
      data_status: 'unavailable',
      provider_status: null,
      error_code: 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
      error_message: 'INSTAGRAM_BUSINESS_ACCOUNT_ID is not set',
      detail: { missing: ['INSTAGRAM_BUSINESS_ACCOUNT_ID'] },
    }
    ops.push(op)
    logOp(op, token)
    await finish(report, 2)
    return 2
  }

  if (igId !== EXPECTED_IG_ID) {
    const op: OpResult = {
      operation: 'credentials.ig_id_check',
      classification: 'CONFIG_ERROR',
      data_status: 'failed',
      provider_status: null,
      error_code: 'ig_id_mismatch',
      error_message: `Configured INSTAGRAM_BUSINESS_ACCOUNT_ID does not match expected ${EXPECTED_IG_ID}`,
      detail: { configured: igId, expected: EXPECTED_IG_ID },
    }
    ops.push(op)
    logOp(op, token)
  }

  const gate = await assertAiBudgetAvailable(0.01)
  report.budget = {
    ok: gate.ok,
    daily_spent: gate.dailySpent,
    daily_limit: gate.dailyLimit,
    remaining: gate.ok ? gate.remaining : null,
    reason: gate.ok ? null : gate.reason,
  }
  if (!gate.ok) {
    const op: OpResult = {
      operation: 'cost_governor',
      classification: 'UNAVAILABLE',
      data_status: 'unavailable',
      provider_status: null,
      error_code: 'budget_exhausted',
      error_message: gate.reason,
      detail: report.budget,
    }
    ops.push(op)
    logOp(op, token)
    await finish(report, 4)
    return 4
  }

  // 6 — status/health first (no Graph write)
  {
    const status = instagramStatus()
    const statusJson = JSON.stringify(status)
    assertNoSecretLeak(statusJson, token)
    const healthChecks = await runHealthChecks()
    const igHealth = healthChecks.find((c) => c.id === 'instagram')
    const ok = status.ok === true && status.auth_mode === 'instagram_login'
    const op: OpResult = {
      operation: 'instagram.status_health',
      classification: ok ? 'SUCCESS' : 'CONFIG_ERROR',
      data_status: status.data_status,
      provider_status: null,
      error_code: ok ? null : 'not_configured',
      error_message: ok ? null : status.note,
      detail: {
        status_ok: status.ok,
        auth_mode: status.auth_mode,
        host: status.host,
        live_publishing_enabled: status.livePublishingEnabled,
        missing: 'missing' in status ? status.missing : [],
        health_status: igHealth?.status ?? null,
        health_summary: igHealth?.summary ?? null,
        secrets_in_status: /"accessToken"\s*:/.test(statusJson),
      },
    }
    ops.push(op)
    logOp(op, token)
    report.status_health_ok = ok
  }

  // 1 — profile
  {
    try {
      const profile = await getInstagramProfile()
      const classification = classifyFromEnvelope(profile)
      if (classification === 'PERMISSION_DENIED') {
        report.missing_permissions_or_scopes.push(
          'instagram_business_basic (or equivalent profile read scope)'
        )
      }
      report.profile =
        profile.value == null
          ? null
          : {
              id: profile.value.id,
              username: profile.value.username,
              account_type: profile.value.account_type,
              followers_count: profile.value.followers_count,
              follows_count: profile.value.follows_count,
              media_count: profile.value.media_count,
              note:
                profile.value.followers_count === null
                  ? 'followers_count absent (null, not zero)'
                  : profile.value.followers_count === 0
                    ? 'followers_count explicit 0 from Meta'
                    : 'followers_count present',
            }
      const op: OpResult = {
        operation: 'getInstagramProfile',
        classification,
        data_status: profile.data_status,
        provider_status: profile.provider_status ?? null,
        error_code: profile.error_code ?? null,
        error_message: profile.error ? redactSecrets(profile.error).slice(0, 300) : null,
        detail: {
          note: profile.note,
          profile: report.profile,
        },
      }
      ops.push(op)
      logOp(op, token)
    } catch (err) {
      const c = classifyThrown(err)
      const op: OpResult = {
        operation: 'getInstagramProfile',
        classification: c.classification,
        data_status: 'failed',
        provider_status: c.provider_status,
        error_code: c.error_code,
        error_message: c.error_message,
        detail: {},
      }
      ops.push(op)
      logOp(op, token)
    }
  }

  // 2 — list media
  let firstMediaId: string | null = null
  let firstMediaType: string | null = null
  let firstMediaProduct: string | null = null
  {
    try {
      const media = await listInstagramMedia({ limit: MEDIA_LIMIT })
      const classification = classifyFromEnvelope(media)
      if (classification === 'PERMISSION_DENIED') {
        report.missing_permissions_or_scopes.push(
          'instagram_business_basic (media list)'
        )
      }
      const count = Array.isArray(media.value) ? media.value.length : null
      report.media_count = count
      if (media.value?.[0]?.id) {
        firstMediaId = media.value[0].id
        firstMediaType = media.value[0].media_type
        firstMediaProduct = media.value[0].media_product_type
      }
      const op: OpResult = {
        operation: 'listInstagramMedia',
        classification,
        data_status: media.data_status,
        provider_status: media.provider_status ?? null,
        error_code: media.error_code ?? null,
        error_message: media.error ? redactSecrets(media.error).slice(0, 300) : null,
        detail: {
          note: media.note,
          media_count: count,
          items: (media.value ?? []).map((m) => ({
            id: m.id,
            media_type: m.media_type,
            media_product_type: m.media_product_type,
            like_count: m.like_count,
            comments_count: m.comments_count,
            timestamp: m.timestamp,
          })),
        },
      }
      ops.push(op)
      logOp(op, token)
    } catch (err) {
      const c = classifyThrown(err)
      const op: OpResult = {
        operation: 'listInstagramMedia',
        classification: c.classification,
        data_status: 'failed',
        provider_status: c.provider_status,
        error_code: c.error_code,
        error_message: c.error_message,
        detail: { media_count: null },
      }
      ops.push(op)
      logOp(op, token)
    }
  }

  // 3 — one media item
  if (!firstMediaId) {
    const op: OpResult = {
      operation: 'getInstagramMedia',
      classification: 'SKIPPED',
      data_status: 'unavailable',
      provider_status: null,
      error_code: null,
      error_message: 'No media id available from list step',
      detail: {},
    }
    ops.push(op)
    logOp(op, token)
  } else {
    try {
      const item = await getInstagramMedia(firstMediaId)
      const classification = classifyFromEnvelope(item)
      report.media_item_ok = classification === 'SUCCESS'
      const op: OpResult = {
        operation: 'getInstagramMedia',
        classification,
        data_status: item.data_status,
        provider_status: item.provider_status ?? null,
        error_code: item.error_code ?? null,
        error_message: item.error ? redactSecrets(item.error).slice(0, 300) : null,
        detail: {
          media_id: firstMediaId,
          media_type: item.value?.media_type ?? null,
          like_count: item.value?.like_count ?? null,
          comments_count: item.value?.comments_count ?? null,
          permalink_present: Boolean(item.value?.permalink),
          note: item.note,
        },
      }
      ops.push(op)
      logOp(op, token)
    } catch (err) {
      const c = classifyThrown(err)
      const op: OpResult = {
        operation: 'getInstagramMedia',
        classification: c.classification,
        data_status: 'failed',
        provider_status: c.provider_status,
        error_code: c.error_code,
        error_message: c.error_message,
        detail: { media_id: firstMediaId },
      }
      ops.push(op)
      logOp(op, token)
    }
  }

  // 4 — insights
  if (!firstMediaId) {
    const op: OpResult = {
      operation: 'getInstagramMediaInsights',
      classification: 'SKIPPED',
      data_status: 'unavailable',
      provider_status: null,
      error_code: null,
      error_message: 'No media id available for insights',
      detail: {},
    }
    ops.push(op)
    logOp(op, token)
  } else {
    const product = (firstMediaProduct || '').toUpperCase()
    const type = (firstMediaType || '').toUpperCase()
    // Instagram Login insights metric sets differ by product type.
    // Do NOT request unsupported metrics (e.g. impressions on some FEED types, plays→use views).
    const metrics =
      product === 'REELS' || type === 'REELS'
        ? ['reach', 'saved', 'shares', 'views', 'total_interactions']
        : type === 'VIDEO'
          ? ['reach', 'saved', 'shares', 'views', 'total_interactions']
          : ['reach', 'saved', 'total_interactions']
    try {
      const insights = await getInstagramMediaInsights(firstMediaId, metrics)
      const classification = classifyFromEnvelope(insights)
      if (classification === 'PERMISSION_DENIED') {
        report.missing_permissions_or_scopes.push(
          'instagram_business_manage_insights (or Instagram Login insights-capable scope)'
        )
      }
      report.insights_ok = classification === 'SUCCESS'
      const op: OpResult = {
        operation: 'getInstagramMediaInsights',
        classification,
        data_status: insights.data_status,
        provider_status: insights.provider_status ?? null,
        error_code: insights.error_code ?? null,
        error_message: insights.error ? redactSecrets(insights.error).slice(0, 300) : null,
        detail: {
          media_id: firstMediaId,
          requested_metrics: metrics,
          insights: (insights.value ?? []).map((i) => ({
            name: i.name,
            period: i.period,
            value: i.values?.[0]?.value ?? null,
          })),
          note: insights.note,
        },
      }
      ops.push(op)
      logOp(op, token)
    } catch (err) {
      const c = classifyThrown(err)
      if (c.classification === 'PERMISSION_DENIED') {
        report.missing_permissions_or_scopes.push(
          'instagram_business_manage_insights (or Instagram Login insights-capable scope)'
        )
      }
      const op: OpResult = {
        operation: 'getInstagramMediaInsights',
        classification: c.classification,
        data_status: 'failed',
        provider_status: c.provider_status,
        error_code: c.error_code,
        error_message: c.error_message,
        detail: { media_id: firstMediaId, requested_metrics: metrics },
      }
      ops.push(op)
      logOp(op, token)
    }
  }

  // 5 — local content performance (DB read only)
  {
    try {
      const perf = await localContentPerformance(30)
      const classification =
        perf.data_status === 'verified' || perf.data_status === 'partial'
          ? 'SUCCESS'
          : perf.data_status === 'unavailable'
            ? 'UNAVAILABLE'
            : 'API_ERROR'
      report.content_performance_ok = classification === 'SUCCESS' || classification === 'UNAVAILABLE'
      const op: OpResult = {
        operation: 'localContentPerformance',
        classification,
        data_status: perf.data_status,
        provider_status: null,
        error_code: null,
        error_message: null,
        detail: {
          note: perf.note,
          row_count: Array.isArray(perf.value) ? perf.value.length : null,
          sample: Array.isArray(perf.value)
            ? perf.value.slice(0, 3).map((r) => ({
                id: r.id,
                status: r.status,
                likes: r.likes,
                comments: r.comments,
                engagement_score: r.engagement_score,
                metrics_data_status: r.metrics_data_status,
              }))
            : [],
        },
      }
      ops.push(op)
      logOp(op, token)
    } catch (err) {
      const c = classifyThrown(err)
      const op: OpResult = {
        operation: 'localContentPerformance',
        classification: c.classification,
        data_status: 'failed',
        provider_status: c.provider_status,
        error_code: c.error_code,
        error_message: c.error_message,
        detail: {},
      }
      ops.push(op)
      logOp(op, token)
    }
  }

  try {
    await recordCostUsage({
      category: 'tool',
      toolName: 'instagram.verify_live_readonly',
      costUsd: 0.01,
      metadata: {
        mode: 'read_only_live',
        auth_mode: 'instagram_login',
        operations: ops.map((o) => o.operation),
      },
    })
    report.budget = { ...report.budget, recorded_cost_usd: 0.01 }
  } catch (err) {
    report.budget = {
      ...report.budget,
      recorded_cost_usd: null,
      record_error: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 200),
    }
  }

  const profileOk = ops.some(
    (o) => o.operation === 'getInstagramProfile' && o.classification === 'SUCCESS'
  )
  const mediaOk = ops.some(
    (o) => o.operation === 'listInstagramMedia' && o.classification === 'SUCCESS'
  )
  report.can_operate_readonly = report.status_health_ok && profileOk && mediaOk

  const exitCode = report.can_operate_readonly ? 0 : 1
  await finish(report, exitCode)
  return exitCode
}

async function finish(
  report: {
    mode: string
    account: string
    auth_mode: string
    host: string
    uses_meta_ads_token: false
    live_instagram_publishing_enabled: boolean
    configured_ig_id: string | null
    expected_ig_id: string
    ig_id_matches_expected: boolean | null
    token_present: boolean
    token_length: number
    profile: Record<string, unknown> | null
    media_count: number | null
    media_item_ok: boolean
    insights_ok: boolean
    content_performance_ok: boolean
    status_health_ok: boolean
    missing_permissions_or_scopes: string[]
    can_operate_readonly: boolean
    operations: OpResult[]
    budget: Record<string, unknown>
    audit: Record<string, unknown>
  },
  exitCode: number
) {
  const token = readInstagramAccessToken()
  try {
    const record = await writeInstagramAudit({
      action: 'instagram.verify_live_readonly',
      target: report.configured_ig_id,
      actor: null,
      approval_state: 'not_required_read_only',
      result: exitCode === 0 ? 'completed' : 'failed',
      provider_response_status: null,
      error_redacted: report.operations
        .filter((o) => o.classification !== 'SUCCESS' && o.classification !== 'SKIPPED')
        .map((o) => `${o.operation}:${o.classification}`)
        .join(', ')
        .slice(0, 400),
      extra: {
        mode: 'read_only_live',
        auth_mode: 'instagram_login',
        can_operate_readonly: report.can_operate_readonly,
        media_count: report.media_count,
        insights_ok: report.insights_ok,
        missing_permissions_or_scopes: report.missing_permissions_or_scopes,
        operation_classes: report.operations.map((o) => ({
          operation: o.operation,
          classification: o.classification,
          provider_status: o.provider_status,
          error_code: o.error_code,
        })),
        live_instagram_publishing_enabled: report.live_instagram_publishing_enabled,
      },
    })
    report.audit = {
      written: true,
      action: 'instagram.verify_live_readonly',
      timestamp: record.timestamp,
      secrets_stored: false,
    }
  } catch (err) {
    report.audit = {
      written: false,
      error: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 200),
      secrets_stored: false,
    }
  }

  const summary = sanitizePublicJson({
    phase: 'summary',
    account: report.account,
    auth_mode: report.auth_mode,
    host: report.host,
    uses_meta_ads_token: false,
    live_instagram_publishing_enabled: report.live_instagram_publishing_enabled,
    profile: report.profile,
    media_count: report.media_count,
    media_retrieval_works: report.media_item_ok,
    insights_work: report.insights_ok,
    content_performance_ok: report.content_performance_ok,
    status_health_ok: report.status_health_ok,
    missing_permissions_or_scopes: [...new Set(report.missing_permissions_or_scopes)],
    can_operate_instagram_readonly: report.can_operate_readonly,
    operations: report.operations.map((o) => ({
      operation: o.operation,
      classification: o.classification,
      data_status: o.data_status,
      provider_status: o.provider_status,
      error_code: o.error_code,
      error_message: o.error_message,
    })),
    audit: report.audit,
    exit_code: exitCode,
  })
  assertNoSecretLeak(summary, token)
  console.log(JSON.stringify(summary))
}

main()
  .then(async (providerExit) => {
    if (providerExit !== 0) {
      process.exit(providerExit)
    }
    // After provider-level live verify, prove Command Center → registry → Meta path.
    console.log(
      JSON.stringify({
        phase: 'operator_e2e_start',
        note: 'Jarvis registry + Command Center integrations path (read-only)',
      })
    )
    const { runInstagramOperatorE2E } = await import('./verify-instagram-operator-e2e')
    const e2e = await runInstagramOperatorE2E()
    process.exit(e2e.exitCode)
  })
  .catch((err) => {
    console.error(
      JSON.stringify({
        phase: 'fatal',
        error: redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300),
      })
    )
    process.exit(1)
  })
