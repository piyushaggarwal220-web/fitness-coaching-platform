/**
 * Jarvis operator unit checks (no network required for core paths).
 * Run: npx tsx scripts/verify-jarvis.ts
 */
import assert from 'node:assert/strict'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'
import { FORBIDDEN_TOOL_NAMES, getTool } from '../src/lib/jarvis/tools/registry'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { estimateTokenCostUsd, DEFAULT_JARVIS_BUDGETS } from '../src/lib/jarvis/types'
import {
  StubVideoEditProvider,
  HttpVideoEditProvider,
  isVideoProviderConfigured,
} from '../src/lib/jarvis/video/provider'
import { isBraveSearchConfigured } from '../src/lib/jarvis/research/brave-search'
import {
  getShopifyCredentials,
  isShopifyConfigured,
  resetShopifyAuthCache,
  shopifyBlockedOperation,
  shopifyTestConnection,
  shopifyTodayCommerce,
} from '../src/lib/jarvis/shopify/client'
import { PROTECTED_JARVIS_SETTING_KEYS } from '../src/lib/jarvis/cost/governor'
import { humanizeJarvisError } from '../src/lib/jarvis/operator-errors'
import { DOMAIN_COMMANDS, memoryGroup, QUICK_COMMANDS, taskStatusLabel, toolFamily } from '../src/lib/jarvis/operator-present'
import { changeVsYesterday, planLabel, planMixSentence, presentCockpit } from '../src/lib/jarvis/operator-cockpit'
import { buildSystemHealth, buildCapabilities, listIntegrationCards } from '../src/lib/jarvis/operator-integrations'
import { jarvisPlanSchema, normalizeJarvisPlanOutput } from '../src/lib/jarvis/core/plan'
import {
  LURVOX_PRODUCT_REVENUE,
  META_AD_PURCHASES,
  METRIC_SOURCES,
  SHOPIFY_STORE_COMMERCE,
  SOURCE_OF_TRUTH_NOT_VERIFIED,
  LURVOX_PRODUCT_REVENUE_METRIC,
  SHOPIFY_STORE_COMMERCE_METRIC,
  META_AD_PURCHASES_METRIC,
  dataSourcesForQuestion,
  getMetricSource,
  jarvisMetricOperatorNotes,
  requireVerifiedMetricSource,
  sourceAllowedForMetric,
} from '../src/lib/jarvis/metrics/source-of-truth'
import {
  containsRawToolName,
  funnelIdFromPurchaseAmount,
  investigationTimelineIsActive,
  operatorTimelineStateForIdleActivity,
  recommendsShopifyLurvoxReconcile,
  separateCommerceSystemsNote,
  shouldInvestigateMetaSyncFirst,
  shouldLoadShopifyForQuestion,
  stripRawToolNamesFromReply,
} from '../src/lib/jarvis/reasoning/boundaries'
import {
  compressOperatorReply,
  countWords,
  detectOperatorReplyMode,
  OPERATOR_REPLY_HARD_WORD_LIMIT,
  presentOperatorReply,
  userRequestedDetail,
} from '../src/lib/jarvis/reasoning/operator-reply'
import {
  classifyMetaSyncError,
  DIAGNOSTIC_META_SYNC_BOUNDS,
  MetaSyncStageTracker,
  withBoundedRetry,
} from '../src/lib/ai-marketing/meta/sync-stages'
import {
  fetchPagesBounded,
  runDiagnosticMetaSync,
  syncMetaMarketingData,
  type MetaSyncDeps,
} from '../src/lib/ai-marketing/meta/sync'
import type { MetaGraphClient } from '../src/lib/ai-marketing/meta/client'
import { MetaApiError } from '../src/lib/ai-marketing/meta/client'
import { classifyProblem } from '../src/lib/jarvis/diagnostics/root-cause-engine'
import { resolveDiagnosticKind } from '../src/lib/jarvis/diagnostics/diagnostic-registry'
import { investigateMetaSyncPipeline } from '../src/lib/jarvis/diagnostics/meta-sync-pipeline'
import {
  lurvoxRevenueFromQuery,
  resolveLurvoxRevenueWindow,
  summarizeLurvoxRows,
} from '../src/lib/jarvis/metrics/lurvox-revenue'
import {
  BUSINESS_TIMEZONE,
  businessRevenueWindows,
  businessToday,
  businessYesterday,
  calendarDateRange,
  lastNCalendarDays,
} from '../src/lib/time/business-calendar'
import {
  filterPurchaseWindow,
  grossCapturedRevenueInr,
  netSalesInr,
  paidCapturedCount,
  purchaseLedgerFromQuery,
  redemptionCount,
  refundsInr,
  summarizePurchaseLedger,
} from '../src/lib/payments/purchase-revenue'

function testJarvisPlanNormalization() {
  const lunaShape = {
    thinking_summary: 'Need read-only Shopify data.',
    tool_calls: [
      { tool: 'shopify.today_revenue', arguments: {} },
      { tool: 'shopify.list_products', arguments: {} },
    ],
  }
  const direct = jarvisPlanSchema.safeParse(lunaShape)
  assert.equal(direct.success, false)
  if (!direct.success) {
    assert.ok(direct.error.issues.some((i) => i.path.join('.') === 'tool_calls.0.why'))
  }

  const normalized = jarvisPlanSchema.safeParse(normalizeJarvisPlanOutput(lunaShape))
  assert.equal(normalized.success, true)
  if (normalized.success) {
    assert.equal(normalized.data.tool_calls[0]?.tool, 'shopify.today_revenue')
    assert.deepEqual(normalized.data.tool_calls[0]?.input, {})
    assert.ok(normalized.data.tool_calls[0]?.why)
    assert.equal(normalized.data.tool_calls[1]?.tool, 'shopify.list_products')
  }

  const nested = normalizeJarvisPlanOutput({
    thinking_summary: 'Check store.',
    tool_calls: [
      {
        type: 'function',
        function: { name: 'shopify.list_orders', arguments: '{"limit":1}' },
      },
    ],
  })
  const nestedParsed = jarvisPlanSchema.safeParse(nested)
  assert.equal(nestedParsed.success, true)
  if (nestedParsed.success) {
    assert.equal(nestedParsed.data.tool_calls[0]?.tool, 'shopify.list_orders')
    assert.equal(nestedParsed.data.tool_calls[0]?.input.limit, 1)
  }

  const named = jarvisPlanSchema.safeParse(
    normalizeJarvisPlanOutput({
      thinking_summary: 'Status only.',
      tool_calls: [{ name: 'shopify.status', arguments: {} }],
    })
  )
  assert.equal(named.success, true)
  if (named.success) {
    assert.equal(named.data.tool_calls[0]?.tool, 'shopify.status')
  }
  console.log('✓ Luna tool_calls arguments/why mapped onto Jarvis plan schema')
}

function testForbiddenTools() {
  assert.ok(FORBIDDEN_TOOL_NAMES.has('system.raise_budget'))
  assert.ok(FORBIDDEN_TOOL_NAMES.has('system.disable_audit'))
  assert.ok(FORBIDDEN_TOOL_NAMES.has('shopify.change_payment_settings'))
  console.log('✓ forbidden self-modification + shopify payment tools listed')
}

async function testPermissionEngine() {
  ensureJarvisToolsRegistered()

  const read = await evaluateToolPermission({
    toolName: 'analytics.today_overview',
    source: 'chat',
  })
  assert.equal(read.allowed, true)
  if (read.allowed) assert.equal(read.mode, 'execute')

  const lurvoxRev = await evaluateToolPermission({
    toolName: 'lurvox.revenue',
    source: 'chat',
  })
  assert.equal(lurvoxRev.allowed, true)
  if (lurvoxRev.allowed) assert.equal(lurvoxRev.mode, 'execute')

  const significant = await evaluateToolPermission({
    toolName: 'meta.increase_budget',
    source: 'chat',
  })
  assert.equal(significant.allowed, true)
  if (significant.allowed) assert.equal(significant.mode, 'require_approval')

  const shopifyPrice = await evaluateToolPermission({
    toolName: 'shopify.update_price',
    source: 'chat',
  })
  assert.equal(shopifyPrice.allowed, true)
  if (shopifyPrice.allowed) assert.equal(shopifyPrice.mode, 'require_approval')

  const diagFix = await evaluateToolPermission({
    toolName: 'diagnostics.propose_fix',
    source: 'chat',
  })
  assert.equal(diagFix.allowed, true)
  if (diagFix.allowed) assert.equal(diagFix.mode, 'require_approval')

  const safeFix = await evaluateToolPermission({
    toolName: 'diagnostics.apply_safe_fix',
    source: 'chat',
  })
  assert.equal(safeFix.allowed, true)
  if (safeFix.allowed) assert.equal(safeFix.mode, 'execute')

  const shopifySeo = await evaluateToolPermission({
    toolName: 'shopify.update_seo',
    source: 'chat',
  })
  assert.equal(shopifySeo.allowed, true)
  if (shopifySeo.allowed) assert.equal(shopifySeo.mode, 'execute')

  const blockedPay = await evaluateToolPermission({
    toolName: 'shopify.change_payment_settings',
    source: 'chat',
  })
  assert.equal(blockedPay.allowed, false)

  const blocked = await evaluateToolPermission({
    toolName: 'system.raise_budget',
    source: 'chat',
  })
  assert.equal(blocked.allowed, false)
  console.log('✓ permissions: READ/LOW execute, SIGNIFICANT approve, DANGEROUS block')
}

function testBudgets() {
  assert.ok(DEFAULT_JARVIS_BUDGETS.daily_ai_budget_usd > 0)
  assert.ok(PROTECTED_JARVIS_SETTING_KEYS.has('daily_ai_budget_usd'))
  assert.ok(PROTECTED_JARVIS_SETTING_KEYS.has('monthly_ai_budget_usd'))
  assert.ok(PROTECTED_JARVIS_SETTING_KEYS.has('per_chat_budget_usd'))
  assert.ok(PROTECTED_JARVIS_SETTING_KEYS.has('max_runtime_minutes'))
  const cost = estimateTokenCostUsd(1_000_000, 1_000_000)
  assert.ok(cost > 0)
  assert.ok(DEFAULT_JARVIS_BUDGETS.max_runtime_minutes > 0)
  console.log('✓ cost governor defaults + protected keys')
}

function testOperatorPresentation() {
  assert.equal(memoryGroup('business_rule'), 'RULES')
  assert.equal(memoryGroup('decision'), 'DECISIONS')
  assert.equal(memoryGroup('research'), 'RESEARCH FINDINGS')
  assert.equal(taskStatusLabel('awaiting_approval'), 'WAITING_FOR_APPROVAL')
  assert.equal(taskStatusLabel('paused_budget'), 'PAUSED_BUDGET')
  assert.equal(toolFamily('meta.increase_budget'), 'Meta Ads')
  assert.equal(toolFamily('shopify.list_orders'), 'Shopify')
  assert.equal(toolFamily('research.objective'), 'Research')
  assert.equal(toolFamily('lurvox.revenue'), 'LURVOX')
  const leaked = humanizeJarvisError('Meta failed sk-abc123token Bearer xyz')
  assert.equal(leaked.includes('sk-abc'), false)
  assert.equal(leaked.includes('Bearer xyz'), false)
  assert.equal(humanizeJarvisError('Shopify 401 shpat_abc123secret').includes('shpat_'), false)
  assert.match(
    humanizeJarvisError('BRAVE_SEARCH_API_KEY is not configured'),
    /BRAVE_SEARCH_API_KEY/
  )
  assert.match(humanizeJarvisError('Daily AI budget exhausted ($1 / $1)'), /paused this task/i)
  assert.match(humanizeJarvisError('video webhook not configured'), /Video provider/i)
  console.log('✓ operator presentation + human errors redact secrets')
}

function testToolRegistry() {
  ensureJarvisToolsRegistered()
  assert.ok(getTool('research.objective'))
  assert.ok(getTool('analytics.investigate'))
  assert.ok(getTool('shopify.list_products'))
  assert.ok(getTool('shopify.update_price'))
  assert.ok(getTool('video.provider_status'))
  assert.ok(getTool('video.create_edit_job'))
  assert.ok(getTool('system.self_test'))
  assert.ok(getTool('system.diagnose'))
  assert.ok(getTool('system.why'))
  assert.ok(getTool('diagnostics.propose_fix'))
  assert.ok(getTool('diagnostics.apply_safe_fix'))
  assert.ok(getTool('lurvox.revenue'))
  console.log('✓ phase-2 tools registered')
}

async function testVideoProvider() {
  const stub = new StubVideoEditProvider()
  assert.equal(stub.configured, false)
  const rendered = await stub.render({
    jobId: 'x',
    sourceVideo: 'https://example.com/a.mp4',
    plan: {
      target_aspect: '9:16',
      captions: true,
      remove_silence: true,
      hooks: [],
      clips: [],
    },
  })
  assert.equal(rendered.status, 'failed')
  assert.equal(rendered.available, false)
  assert.ok(rendered.error?.includes('not configured'))
  assert.equal(rendered.output_video ?? null, null)

  const processed = await stub.process({
    id: 'y',
    source_video: 's',
    edit_instructions: {},
  })
  assert.notEqual(processed.status, 'completed')
  assert.ok(!processed.output_video)

  // Without webhook, http provider is not configured
  const prev = process.env.VIDEO_EDIT_WEBHOOK_URL
  delete process.env.VIDEO_EDIT_WEBHOOK_URL
  const http = new HttpVideoEditProvider()
  assert.equal(http.configured, false)
  if (prev) process.env.VIDEO_EDIT_WEBHOOK_URL = prev

  // isVideoProviderConfigured reflects env honestly
  assert.equal(typeof isVideoProviderConfigured(), 'boolean')
  console.log('✓ video stub never fakes success; http requires webhook')
}

function testResearchConfig() {
  // Missing key → not configured (honest)
  const prevKey = process.env.BRAVE_SEARCH_API_KEY
  const prevProv = process.env.JARVIS_WEB_SEARCH_PROVIDER
  delete process.env.BRAVE_SEARCH_API_KEY
  process.env.JARVIS_WEB_SEARCH_PROVIDER = 'brave'
  assert.equal(isBraveSearchConfigured(), false)

  // Human errors distinguish missing key vs rate limit / auth
  assert.match(
    humanizeJarvisError('BRAVE_SEARCH_API_KEY is not configured'),
    /BRAVE_SEARCH_API_KEY is not configured/
  )
  assert.match(
    humanizeJarvisError('Brave search rate limited'),
    /rate-limited/i
  )
  assert.match(
    humanizeJarvisError('Brave search unauthorized (invalid or missing BRAVE_SEARCH_API_KEY)'),
    /rejected by Brave/i
  )

  if (prevKey) process.env.BRAVE_SEARCH_API_KEY = prevKey
  else delete process.env.BRAVE_SEARCH_API_KEY
  if (prevProv) process.env.JARVIS_WEB_SEARCH_PROVIDER = prevProv
  else delete process.env.JARVIS_WEB_SEARCH_PROVIDER
  console.log('✓ research missing API key detected')
}

function testShopifyBlocked() {
  let threw = false
  try {
    shopifyBlockedOperation('billing')
  } catch (e) {
    threw = true
    assert.ok(e instanceof Error && /Blocked/.test(e.message))
  }
  assert.equal(threw, true)
  const creds = getShopifyCredentials()
  const dumped = JSON.stringify(creds)
  assert.equal('accessToken' in creds, false)
  assert.equal(dumped.includes('clientSecret'), false)
  assert.equal(dumped.includes('client_secret'), false)
  if (creds.ok) {
    assert.ok(creds.shopDomain.endsWith('.myshopify.com'))
    assert.ok(creds.apiVersion)
  } else {
    assert.ok(creds.missing.length > 0)
  }
  const secret = process.env.SHOPIFY_CLIENT_SECRET
  if (secret && secret.length > 8) {
    assert.equal(dumped.includes(secret), false)
  }
  console.log('✓ shopify payment blocked; credentials server-only shape')
}

function testFunnelSeparationInCatalog() {
  ensureJarvisToolsRegistered()
  const inv = getTool('analytics.investigate')
  assert.ok(inv?.description.toLowerCase().includes('shopify') || inv?.description.includes('Meta'))
  const funnels = getTool('funnels.list')
  assert.ok(funnels?.description.includes('Never blend') || funnels?.description.includes('₹'))
  const overview = getTool('analytics.today_overview')
  assert.ok(overview?.description.toLowerCase().includes('shopify'))
  assert.ok(overview?.description.includes('₹99'))
  assert.ok(getTool('shopify.today_revenue'))
  const lurvox = getTool('lurvox.revenue')
  assert.ok(lurvox)
  assert.match(lurvox?.description ?? '', /purchases/)
  assert.match(lurvox?.description ?? '', /Asia\/Kolkata/)
  assert.equal(/not shopify/i.test(lurvox?.description ?? ''), true)
  console.log('✓ cross-system investigate + funnel separation + shopify revenue tool')
}

function testMetricSourceOfTruthCatalog() {
  assert.equal(LURVOX_PRODUCT_REVENUE.source_of_truth_verified, true)
  assert.match(LURVOX_PRODUCT_REVENUE.source_of_truth, /purchases/)
  assert.equal(LURVOX_PRODUCT_REVENUE.alignment, 'aligned')
  assert.match(LURVOX_PRODUCT_REVENUE.jarvis_current.source, /purchases/)
  assert.equal(LURVOX_PRODUCT_REVENUE.source_of_truth.toLowerCase().includes('shopify'), false)
  assert.equal(sourceAllowedForMetric(LURVOX_PRODUCT_REVENUE_METRIC, 'public.purchases'), true)
  assert.equal(sourceAllowedForMetric(LURVOX_PRODUCT_REVENUE_METRIC, 'shopify'), false)
  assert.equal(sourceAllowedForMetric(LURVOX_PRODUCT_REVENUE_METRIC, 'meta'), false)
  assert.equal(sourceAllowedForMetric(SHOPIFY_STORE_COMMERCE_METRIC, 'public.purchases'), false)
  assert.equal(sourceAllowedForMetric(META_AD_PURCHASES_METRIC, 'public.purchases'), false)
  assert.equal(SHOPIFY_STORE_COMMERCE.alignment, 'aligned')
  assert.match(SHOPIFY_STORE_COMMERCE.database_or_api, /Shopify/)
  assert.ok(META_AD_PURCHASES.do_not.some((d) => d.toLowerCase().includes('revenue')))
  assert.equal(getMetricSource('lurvox_product_revenue')?.metric, 'lurvox_product_revenue')
  assert.equal(requireVerifiedMetricSource('not_a_real_metric'), SOURCE_OF_TRUTH_NOT_VERIFIED)
  assert.ok(METRIC_SOURCES.length >= 3)
  assert.ok(jarvisMetricOperatorNotes().some((n) => n.includes('public.purchases')))
  assert.deepEqual(dataSourcesForQuestion('How has my business been going over the last 2 days?'), [
    LURVOX_PRODUCT_REVENUE_METRIC,
  ])
  assert.deepEqual(dataSourcesForQuestion('What is my revenue today?'), [LURVOX_PRODUCT_REVENUE_METRIC])
  assert.deepEqual(dataSourcesForQuestion('How much revenue did I make yesterday?'), [
    LURVOX_PRODUCT_REVENUE_METRIC,
  ])
  assert.deepEqual(dataSourcesForQuestion('How much did my Shopify store make today?'), [
    SHOPIFY_STORE_COMMERCE_METRIC,
  ])
  assert.deepEqual(dataSourcesForQuestion('How much did I spend on Meta ads today?'), [
    META_AD_PURCHASES_METRIC,
  ])
  console.log('✓ metric source-of-truth catalog does not treat Shopify as LURVOX cash revenue')
}

function testLurvoxPurchaseLedger() {
  const rows = [
    {
      status: 'captured',
      amount_paise: 9900,
      refunded_amount_paise: 0,
      created_at: '2026-09-19T12:00:00.000Z',
      currency: 'INR',
      plan_slug: 'digital_complete',
    },
    {
      status: 'redeemed',
      amount_paise: 0,
      refunded_amount_paise: 0,
      created_at: '2026-09-19T12:05:00.000Z',
      currency: 'INR',
      plan_slug: '12_months',
    },
    {
      status: 'captured',
      amount_paise: 169900,
      refunded_amount_paise: 50000,
      created_at: '2026-09-19T15:06:27.000Z',
      currency: 'INR',
      plan_slug: '12_months',
    },
    {
      status: 'captured',
      amount_paise: 9900,
      refunded_amount_paise: 0,
      created_at: '2026-09-19T18:29:59.000Z',
      currency: 'INR',
      plan_slug: 'digital_complete',
    },
    {
      status: 'captured',
      amount_paise: 9900,
      refunded_amount_paise: 0,
      created_at: '2026-09-19T18:30:00.000Z',
      currency: 'INR',
      plan_slug: 'digital_complete',
    },
    {
      status: 'captured',
      amount_paise: 19900,
      refunded_amount_paise: 0,
      created_at: '2026-09-20T10:00:00.000Z',
      currency: 'INR',
      plan_slug: 'digital_workout',
    },
  ]

  const all = summarizePurchaseLedger(rows)
  assert.equal(all.gross_inr, 9900 / 100 + 1699 + 99 + 99 + 199)
  assert.equal(all.redemption_count, 1)
  assert.equal(all.redemption_inr, 0)
  assert.equal(all.paid_count, 5)
  assert.equal(all.refunds_inr, 500)
  assert.equal(all.net_inr, all.gross_inr - 500)
  assert.equal(grossCapturedRevenueInr(rows.filter((r) => r.status === 'redeemed')), 0)
  assert.equal(paidCapturedCount(rows.filter((r) => r.status === 'redeemed')), 0)
  assert.equal(redemptionCount(rows), 1)
  assert.equal(refundsInr(rows), 500)
  assert.equal(netSalesInr(rows), all.gross_inr - 500)

  const failed = purchaseLedgerFromQuery({ data: null, error: { message: 'connection refused' } })
  assert.equal(failed.ok, false)
  if (!failed.ok) {
    assert.equal(failed.data_status, 'failed')
    assert.equal(failed.rows, null)
  }
  const missing = purchaseLedgerFromQuery({ data: null, error: null })
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.equal(missing.data_status, 'unavailable')

  const sep19 = calendarDateRange('Asia/Kolkata', '2026-09-19', '2026-09-19')
  const sep19Rows = filterPurchaseWindow(rows, sep19.start, sep19.endExclusive)
  const sep19Sum = summarizePurchaseLedger(sep19Rows)
  assert.equal(sep19Sum.paid_count, 3)
  assert.equal(sep19Sum.gross_inr, 99 + 1699 + 99)
  assert.equal(sep19Sum.redemption_count, 1)

  const sep20 = calendarDateRange('Asia/Kolkata', '2026-09-20', '2026-09-20')
  const sep20Rows = filterPurchaseWindow(rows, sep20.start, sep20.endExclusive)
  const sep20Sum = summarizePurchaseLedger(sep20Rows)
  assert.equal(sep20Sum.paid_count, 2)
  assert.equal(sep20Sum.gross_inr, 99 + 199)
  assert.equal(sep20Sum.redemption_count, 0)

  const now = new Date('2026-09-20T10:30:00.000Z')
  const todayWindow = resolveLurvoxRevenueWindow({ preset: 'today', now }, now)
  assert.equal(todayWindow.ok, true)
  if (todayWindow.ok) {
    assert.equal(todayWindow.from_ymd, '2026-09-20')
    const todayRows = summarizeLurvoxRows(rows, todayWindow)
    assert.equal(todayRows.totals.gross_inr, 99 + 199)
    const late = rows.find((r) => r.created_at === '2026-09-20T10:00:00.000Z')
    assert.ok(late)
  }

  const yesterday = resolveLurvoxRevenueWindow({ preset: 'yesterday', now }, now)
  assert.equal(yesterday.ok, true)
  if (yesterday.ok) {
    assert.equal(yesterday.from_ymd, '2026-09-19')
    assert.equal(summarizeLurvoxRows(rows, yesterday).totals.gross_inr, 99 + 1699 + 99)
  }

  const last2 = resolveLurvoxRevenueWindow({ preset: 'last_n_days', days: 2, now }, now)
  assert.equal(last2.ok, true)
  if (last2.ok) {
    assert.equal(last2.from_ymd, '2026-09-19')
    assert.equal(last2.to_ymd, '2026-09-20')
    const ranged = summarizeLurvoxRows(rows, last2)
    assert.equal(ranged.by_day.length, 2)
    assert.equal(ranged.totals.gross_inr, 99 + 1699 + 99 + 99 + 199)
  }

  const explicit = resolveLurvoxRevenueWindow({ from: '2026-09-18', to: '2026-09-19', now }, now)
  assert.equal(explicit.ok, true)
  if (explicit.ok) {
    assert.equal(explicit.from_ymd, '2026-09-18')
    assert.equal(explicit.to_ymd, '2026-09-19')
  }

  const failedTool = lurvoxRevenueFromQuery({
    query: { data: null, error: { message: 'timeout' } },
    window: {
      start: sep20.start,
      endExclusive: sep20.endExclusive,
      from_ymd: '2026-09-20',
      to_ymd: '2026-09-20',
      label: 'today',
    },
  })
  assert.equal(failedTool.ok, false)
  assert.equal(failedTool.gross_inr, null)
  assert.equal(failedTool.data_status, 'failed')
  assert.notEqual(failedTool.gross_inr, 0)
  assert.match(failedTool.note, /not ₹0/)

  const emptyTool = lurvoxRevenueFromQuery({
    query: { data: [], error: null },
    window: {
      start: sep20.start,
      endExclusive: sep20.endExclusive,
      from_ymd: '2026-09-20',
      to_ymd: '2026-09-20',
      label: 'today',
    },
  })
  assert.equal(emptyTool.ok, true)
  assert.equal(emptyTool.gross_inr, 0)
  assert.equal(emptyTool.data_status, 'verified')
  assert.equal(emptyTool.source, 'public.purchases')
  assert.equal(emptyTool.timezone, 'Asia/Kolkata')
  assert.ok(emptyTool.period_start)
  assert.ok(emptyTool.calculation_method)

  const capturedTool = lurvoxRevenueFromQuery({
    query: { data: rows, error: null },
    window: {
      start: sep20.start,
      endExclusive: sep20.endExclusive,
      from_ymd: '2026-09-20',
      to_ymd: '2026-09-20',
      label: 'today',
    },
  })
  assert.equal(capturedTool.source, 'public.purchases')
  assert.notEqual(capturedTool.source, 'shopify')
  assert.notEqual(capturedTool.source, 'meta')
  assert.equal(capturedTool.redemption_count, 0)
  assert.equal(capturedTool.gross_inr, 99 + 199)
  console.log('✓ LURVOX purchase ledger: captured vs redeemed, refunds, IST windows, failure≠0')
}

function testSharedIstBusinessCalendar() {
  const now = new Date('2026-09-20T10:30:00.000Z') // 16:00 IST Sep 20
  const windows = businessRevenueWindows(now)
  const jarvisToday = resolveLurvoxRevenueWindow({ preset: 'today', now }, now)
  const jarvisYesterday = resolveLurvoxRevenueWindow({ preset: 'yesterday', now }, now)
  assert.equal(windows.timezone, 'Asia/Kolkata')
  assert.equal(jarvisToday.ok, true)
  assert.equal(jarvisYesterday.ok, true)
  if (jarvisToday.ok) {
    assert.equal(windows.today.start.toISOString(), jarvisToday.start.toISOString())
    assert.equal(windows.today.endExclusive.toISOString(), jarvisToday.endExclusive.toISOString())
    assert.equal(windows.today.from_ymd, '2026-09-20')
    assert.equal(windows.today.start.toISOString(), '2026-09-19T18:30:00.000Z')
    assert.equal(windows.today.endExclusive.toISOString(), '2026-09-20T18:30:00.000Z')
  }
  if (jarvisYesterday.ok) {
    assert.equal(windows.yesterday.start.toISOString(), jarvisYesterday.start.toISOString())
    assert.equal(windows.yesterday.endExclusive.toISOString(), jarvisYesterday.endExclusive.toISOString())
    assert.equal(windows.yesterday.from_ymd, '2026-09-19')
    assert.equal(windows.yesterday.start.toISOString(), '2026-09-18T18:30:00.000Z')
    assert.equal(windows.yesterday.endExclusive.toISOString(), '2026-09-19T18:30:00.000Z')
  }

  const justBefore = {
    status: 'captured',
    amount_paise: 9900,
    refunded_amount_paise: 0,
    created_at: '2026-09-19T18:29:59.000Z',
    currency: 'INR',
    plan_slug: 'digital_complete',
  }
  const justAfter = {
    status: 'captured',
    amount_paise: 169900,
    refunded_amount_paise: 0,
    created_at: '2026-09-19T18:30:00.000Z',
    currency: 'INR',
    plan_slug: '12_months',
  }
  const rows = [justBefore, justAfter]
  const adminToday = grossCapturedRevenueInr(
    filterPurchaseWindow(rows, windows.today.start, windows.today.endExclusive)
  )
  const adminYesterday = grossCapturedRevenueInr(
    filterPurchaseWindow(rows, windows.yesterday.start, windows.yesterday.endExclusive)
  )
  assert.equal(adminToday, 1699)
  assert.equal(adminYesterday, 99)

  if (jarvisToday.ok) {
    const jarvis = lurvoxRevenueFromQuery({
      query: { data: rows, error: null },
      window: { ...jarvisToday, label: 'today' },
    })
    assert.equal(jarvis.gross_inr, adminToday)
    assert.equal(jarvis.paid_count, 1)
  }
  if (jarvisYesterday.ok) {
    const jarvis = lurvoxRevenueFromQuery({
      query: { data: rows, error: null },
      window: { ...jarvisYesterday, label: 'yesterday' },
    })
    assert.equal(jarvis.gross_inr, adminYesterday)
  }

  assert.equal(businessToday(now).start.toISOString(), windows.today.start.toISOString())
  assert.equal(businessYesterday(now).endExclusive.toISOString(), windows.yesterday.endExclusive.toISOString())
  const last2 = lastNCalendarDays(BUSINESS_TIMEZONE, now, 2)
  assert.equal(last2.from_ymd, '2026-09-19')
  assert.equal(last2.to_ymd, '2026-09-20')
  const explicit = calendarDateRange(BUSINESS_TIMEZONE, '2026-09-18', '2026-09-19')
  assert.equal(explicit.start.toISOString(), '2026-09-17T18:30:00.000Z')
  assert.equal(explicit.endExclusive.toISOString(), '2026-09-19T18:30:00.000Z')
  console.log('✓ Admin P&L and Jarvis share identical IST today/yesterday windows')
}

function testQuickCommands() {
  const labels = [...QUICK_COMMANDS, ...DOMAIN_COMMANDS].map((c) => c.label)
  for (const required of [
    "Today's brief",
    'Analyze revenue',
    'Analyze ₹99 Funnel',
    'Analyze ₹1,699 Funnel',
    'Find problems',
    'Research',
    'Pending Approvals',
    'What should I do?',
    'Check ads',
  ]) {
    assert.ok(labels.includes(required), `missing quick command ${required}`)
  }
  assert.equal(
    QUICK_COMMANDS.find((c) => c.id === 'revenue')?.prompt,
    'How much money did we make today?'
  )
  console.log('✓ owner quick commands send natural-language prompts')
}

function testCockpitPresentation() {
  const cell = (
    value: number | null,
    status: 'ok' | 'no_data' | 'error' | 'not_connected',
    source: string
  ) => ({
    value,
    display: value == null ? 'n/a' : String(value),
    status,
    source,
    hint: `${source} hint`,
    data_status: status === 'ok' ? 'verified' : status === 'error' ? 'failed' : 'unavailable',
  })
  const cockpit = presentCockpit({
    now: new Date('2026-09-20T18:00:00+05:30'),
    refreshed_at: new Date('2026-09-20T18:00:00+05:30').toISOString(),
    pulse: {
      today: {
        revenue: cell(2682, 'ok', 'public.purchases'),
        orders: cell(18, 'ok', 'public.purchases'),
        aov: cell(149, 'ok', 'public.purchases'),
        ad_spend: cell(null, 'no_data', 'meta'),
        cpa: cell(null, 'no_data', 'meta'),
        roas: cell(null, 'no_data', 'meta'),
      },
      yesterday: {
        revenue: cell(2887, 'ok', 'public.purchases'),
        orders: cell(13, 'ok', 'public.purchases'),
      },
      by_plan: [{ plan_slug: '6-months', gross_inr: 1782, paid_count: 12 }],
      shopify: { connected: true, orders: 0 },
    },
    health: {
      level: 'partial',
      label: 'Operational',
      explanation: '7/8 systems connected. 1 system needs attention.',
      connected_count: 7,
      total_count: 8,
      attention_count: 1,
    },
    approvals: [],
    incidents: [],
    tasks: [],
  })
  assert.equal(cockpit.greeting, "Good evening. Here's what matters today.")
  assert.match(cockpit.brief, /₹2,682/)
  assert.match(cockpit.brief, /18 paid sales/)
  assert.match(cockpit.brief, /6 months accounted for 12 of 18 paid sales today/)
  assert.equal(cockpit.brief.includes('driving'), false)
  assert.equal(cockpit.brief.toLowerCase().includes('driving most'), false)
  assert.match(cockpit.brief, /Meta performance data is currently unavailable/)
  assert.equal(cockpit.metrics.find((m) => m.id === 'ad_spend')?.display, 'Unavailable')
  assert.equal(cockpit.metrics.find((m) => m.id === 'ad_spend')?.change_label, 'No Meta data')
  assert.equal(cockpit.metrics.find((m) => m.id === 'ad_spend')?.status_label, 'Unavailable')
  assert.equal(cockpit.metrics.find((m) => m.id === 'revenue')?.display, '₹2,682')
  assert.equal(cockpit.metrics.find((m) => m.id === 'revenue')?.status_label, 'Verified')
  assert.ok(cockpit.changes.some((c) => c.id === 'revenue' || c.title.includes('Revenue') || c.title === 'Yesterday'))
  assert.ok(cockpit.changes.some((c) => c.id === 'meta-gap'))
  assert.match(cockpit.insight.text, /Meta analysis is currently blocked/)
  assert.equal(cockpit.recommendations.length, 1)
  assert.match(cockpit.recommendations[0].title, /Meta/)
  assert.match(cockpit.recommendations[0].risk, /No spend change/)
  assert.equal(cockpit.health.label, 'Operational')
  assert.match(cockpit.freshness.label, /^Updated /)
  assert.equal(cockpit.freshness.stale, false)
  assert.equal(planLabel('offer-1699'), '₹1,699 product')
  assert.equal(planLabel('tap-99'), '₹99 product')
  assert.equal(
    planMixSentence([{ plan_slug: '6-months', paid_count: 12 }], 18),
    '6 months accounted for 12 of 18 paid sales today.'
  )
  assert.equal(planMixSentence([{ plan_slug: '6-months', paid_count: 20 }], 18), null)
  assert.equal(planMixSentence([], 18), null)
  assert.equal(planMixSentence([{ plan_slug: '6-months', paid_count: 12 }], null), null)

  const morning = presentCockpit({
    now: new Date('2026-09-21T08:00:00+05:30'),
    pulse: {
      today: {
        revenue: cell(0, 'ok', 'public.purchases'),
        orders: cell(0, 'ok', 'public.purchases'),
        aov: { value: null, display: 'n/a', status: 'no_data', source: 'public.purchases', hint: 'AOV needs a sale' },
        ad_spend: cell(null, 'no_data', 'meta'),
        cpa: cell(null, 'no_data', 'meta'),
        roas: cell(null, 'no_data', 'meta'),
      },
      yesterday: {
        revenue: cell(4381, 'ok', 'public.purchases'),
        orders: cell(19, 'ok', 'public.purchases'),
      },
    },
    incidents: [
      { id: '1', title: 'Incident A', status: 'open' },
      { id: '2', title: 'Incident B', status: 'diagnosed' },
      { id: '3', title: 'Incident C', status: 'investigating' },
    ],
  })
  assert.equal(morning.greeting, "Good morning. Here's what matters today.")
  assert.match(morning.brief, /Yesterday LURVOX collected/)
  assert.match(morning.brief, /₹4,381/)
  assert.match(morning.brief, /Today has started with ₹0/)
  assert.equal(morning.metrics.find((m) => m.id === 'revenue')?.display, '₹0')
  assert.equal(morning.metrics.find((m) => m.id === 'revenue')?.change_pct, null)
  assert.match(morning.metrics.find((m) => m.id === 'revenue')?.change_label ?? '', /yesterday/)
  assert.equal((morning.metrics.find((m) => m.id === 'revenue')?.change_label ?? '').includes('-100'), false)
  assert.equal(morning.insight.text, 'Meta analysis is currently blocked because no verified marketing_performance rows are available.')
  assert.ok(!morning.insight.text.toLowerCase().includes('performing poorly'))
  assert.ok(morning.changes.some((c) => c.id === 'revenue-yesterday' && c.why.includes('₹4,381')))
  assert.ok(morning.changes.some((c) => c.id === 'revenue-today' && c.why.includes('₹0')))
  assert.ok(morning.changes.some((c) => c.id === 'meta-gap'))
  assert.equal(morning.attention.length, 1)
  assert.match(morning.attention[0].title, /3 diagnostic incidents need attention/)
  assert.equal(morning.attention[0].action, 'diagnostics')

  const failed = presentCockpit({
    pulse: {
      today: {
        revenue: cell(null, 'error', 'public.purchases'),
        orders: cell(null, 'error', 'public.purchases'),
      },
    },
  })
  assert.equal(failed.metrics.find((m) => m.id === 'revenue')?.display, 'Failed')
  assert.equal(failed.metrics.find((m) => m.id === 'revenue')?.value, null)
  assert.ok(!failed.brief.includes('₹0'))
  assert.equal(failed.brief.includes('driving'), false)
  const stale = presentCockpit({
    refreshed_at: new Date('2026-09-20T16:00:00+05:30').toISOString(),
    now: new Date('2026-09-20T18:00:00+05:30'),
    pulse: {
      today: {
        revenue: {
          value: 100,
          display: '₹100',
          status: 'ok',
          source: 'public.purchases',
          hint: 'stale sample',
          data_status: 'stale',
        },
        orders: cell(1, 'ok', 'public.purchases'),
      },
    },
  })
  assert.equal(stale.freshness.stale, true)
  assert.match(stale.freshness.label, /Some data may be stale/)
  const zero = changeVsYesterday(0, 0)
  assert.equal(zero.direction, 'flat')
  const fromZero = changeVsYesterday(100, 0)
  assert.equal(fromZero.pct, null)
  console.log('✓ cockpit presentation uses real data and never fabricates zeros')
}

async function testIntegrationsHonesty() {
  const prev = {
    shop: process.env.SHOPIFY_SHOP,
    clientId: process.env.SHOPIFY_CLIENT_ID,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
    domain: process.env.SHOPIFY_SHOP_DOMAIN,
    store: process.env.SHOPIFY_STORE_DOMAIN,
    token: process.env.SHOPIFY_ACCESS_TOKEN,
    adminToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  }
  delete process.env.SHOPIFY_SHOP
  delete process.env.SHOPIFY_CLIENT_ID
  delete process.env.SHOPIFY_CLIENT_SECRET
  delete process.env.SHOPIFY_SHOP_DOMAIN
  delete process.env.SHOPIFY_STORE_DOMAIN
  delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
  process.env.SHOPIFY_ACCESS_TOKEN = 'static-token-should-be-ignored'
  resetShopifyAuthCache()

  assert.equal(isShopifyConfigured(), false)
  const commerce = await shopifyTodayCommerce()
  assert.equal(commerce.connected, false)
  assert.equal(commerce.revenue, null)
  assert.equal(commerce.orders, null)
  assert.equal(commerce.data_status, 'unavailable')
  assert.match(commerce.unavailable_reason ?? '', /Shopify is not connected/)

  const ping = await shopifyTestConnection()
  assert.equal(ping.ok, false)
  assert.equal(ping.status, 'not_connected')
  assert.match(ping.message, /SHOPIFY_SHOP|SHOPIFY_CLIENT_ID|SHOPIFY_CLIENT_SECRET/)
  assert.equal(JSON.stringify(ping).includes('static-token-should-be-ignored'), false)

  const cards = await listIntegrationCards()
  const ids = cards.map((c) => c.id)
  for (const id of ['openai', 'supabase', 'meta', 'shopify', 'instagram', 'brave', 'video']) {
    assert.ok(ids.includes(id), `missing integration ${id}`)
  }
  const serialized = JSON.stringify(cards)
  assert.equal(serialized.includes('sk-'), false)
  assert.equal(/access_token["']?\s*:/i.test(serialized), false)
  const shopify = cards.find((c) => c.id === 'shopify')
  assert.equal(shopify?.status, 'not_connected')
  assert.match(shopify?.summary ?? '', /unavailable/i)
  assert.match(shopify?.configure_hint ?? '', /SHOPIFY_CLIENT_SECRET/)

  const health = buildSystemHealth(cards)
  assert.ok(['operational', 'partial', 'action_required'].includes(health.level))
  assert.ok(health.explanation.length > 10)

  ensureJarvisToolsRegistered()
  const caps = await buildCapabilities()
  assert.ok(caps.BLOCKED.some((item) => item.tool === 'system.raise_budget'))
  assert.ok(caps.BLOCKED.some((item) => item.tool === 'system.enable_live_meta'))
  assert.ok(caps['WAITING FOR INTEGRATION'].some((item) => item.tool?.startsWith('shopify.')))
  const budgetCap = [...caps['REQUIRES APPROVAL'], ...caps['WAITING FOR INTEGRATION']].find(
    (item) => item.tool === 'meta.increase_budget'
  )
  assert.ok(budgetCap, 'Meta budget changes must require approval or wait for Meta')
  assert.equal(caps.WORKING.some((item) => item.tool === 'meta.increase_budget'), false)

  delete process.env.SHOPIFY_ACCESS_TOKEN
  if (prev.shop) process.env.SHOPIFY_SHOP = prev.shop
  if (prev.clientId) process.env.SHOPIFY_CLIENT_ID = prev.clientId
  if (prev.clientSecret) process.env.SHOPIFY_CLIENT_SECRET = prev.clientSecret
  if (prev.domain) process.env.SHOPIFY_SHOP_DOMAIN = prev.domain
  if (prev.store) process.env.SHOPIFY_STORE_DOMAIN = prev.store
  if (prev.token) process.env.SHOPIFY_ACCESS_TOKEN = prev.token
  if (prev.adminToken) process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = prev.adminToken
  resetShopifyAuthCache()
  console.log('✓ integrations + shopify revenue stay honest (no fake ₹0, no secrets)')
}

async function testDiagnostics() {
  const { MODELS } = await import('../src/lib/ai/config')
  const {
    interpretShopifyGraphqlResponse,
    inspectToolOutputContract,
    executeSafeToolTest,
    evaluateRemediationPermission,
    calendarDayWindow,
    utcMidnightWindow,
    timezoneMismatchRisk,
    metricProvenance,
    numericFromSource,
    unexpectedZero,
    redactDiagnosticText,
    redactDiagnosticValue,
    DiagnosticBudgetTracker,
    selectModel,
    runDiagnostic,
  } = await import('../src/lib/jarvis/diagnostics')

  const failedZero = inspectToolOutputContract({
    tool: 'shopify.today_revenue',
    output: {
      ok: false,
      status: 'failed',
      error_type: 'API_ERROR',
      data_status: 'failed',
      revenue: 0,
      orders: 0,
    },
    executed: true,
    inputValid: true,
  })
  assert.ok(failedZero.anomalies.some((a) => a.type === 'unexpected_zero' || a.type === 'hidden_failure'))
  assert.equal(numericFromSource({ sourceValue: 0, dataStatus: 'failed' }), null)
  assert.equal(unexpectedZero({ value: 0, data_status: 'failed', sourceExplicitZero: false }), true)
  console.log('✓ API failure is not numeric zero')

  const gql = interpretShopifyGraphqlResponse({
    httpStatus: 200,
    json: { errors: [{ message: 'Access denied for draftOrders' }], data: null },
    requestId: 'req-1',
  })
  assert.equal(gql.http_ok, true)
  assert.equal(gql.graphql_ok, false)
  assert.equal(gql.data_status, 'failed')
  const gqlPartial = interpretShopifyGraphqlResponse({
    httpStatus: 200,
    json: { errors: [{ message: 'warning' }], data: { ordersCount: { count: 0 } } },
  })
  assert.equal(gqlPartial.data_status, 'partial')
  console.log('✓ GraphQL HTTP 200 with errors is not success')

  const now = new Date('2026-09-20T02:00:00.000Z')
  const ist = calendarDayWindow('Asia/Kolkata', now, 0)
  const utc = utcMidnightWindow(now)
  assert.equal(ist.ymd, '2026-09-20')
  assert.equal(ist.start.toISOString(), '2026-09-19T18:30:00.000Z')
  assert.equal(utc.start.toISOString(), '2026-09-20T00:00:00.000Z')
  const tz = timezoneMismatchRisk({ shopTimezone: 'Asia/Kolkata', pipelineTimezone: 'UTC' })
  assert.equal(tz.mismatch, true)
  console.log('✓ IST calendar day is not UTC midnight')

  const malformed = inspectToolOutputContract({
    tool: 'shopify.today_revenue',
    output: [null, undefined],
    executed: true,
    inputValid: true,
  })
  assert.ok(malformed.anomalies.some((a) => a.type === 'null_undefined'))
  console.log('✓ malformed tool output detected')

  ensureJarvisToolsRegistered()
  const schema = await executeSafeToolTest('shopify.order_stats', { days: 'nope' })
  assert.equal(schema.input_valid, false)
  assert.ok(schema.anomalies.some((a) => a.type === 'schema_mismatch'))
  console.log('✓ schema validation failure detected')

  const stale = inspectToolOutputContract({
    tool: 'shopify.today_revenue',
    output: { ok: true, as_of: '2020-01-01T00:00:00.000Z', revenue: 10, orders: 1, data_status: 'verified' },
    executed: true,
    inputValid: true,
  })
  assert.ok(stale.anomalies.some((a) => a.type === 'stale_timestamp'))
  console.log('✓ stale timestamp detected')

  const unavailable = metricProvenance({
    metric: 'shopify_revenue',
    value: 0,
    timezone: 'UTC',
    source: 'shopify.orders',
    data_status: 'unavailable',
    calculation_method: 'none',
  })
  assert.equal(unavailable.value, null)
  assert.equal(unavailable.data_status, 'unavailable')
  console.log('✓ unavailable integration does not become 0')

  const verifiedEmpty = inspectToolOutputContract({
    tool: 'shopify.today_revenue',
    output: { ok: true, revenue: 0, orders: 0, data_status: 'verified' },
    executed: true,
    inputValid: true,
  })
  assert.equal(verifiedEmpty.anomalies.some((a) => a.type === 'hidden_failure'), false)
  console.log('✓ verified empty API result may be 0')

  assert.equal(evaluateRemediationPermission('refresh_token'), 'auto')
  assert.equal(evaluateRemediationPermission('code_change'), 'require_approval')
  assert.equal(evaluateRemediationPermission('change_meta_campaigns'), 'require_approval')
  assert.equal(evaluateRemediationPermission('weaken_security'), 'forbidden')
  console.log('✓ approval-required remediations stay gated')

  const redacted = JSON.stringify(
    redactDiagnosticValue({
      access_token: 'shpata_live_secret',
      authorization: 'Bearer abc.def',
      password: 'hunter2',
      email: 'customer@example.com',
      revenue: 12,
    })
  )
  assert.equal(redacted.includes('shpata_live_secret'), false)
  assert.equal(redacted.includes('hunter2'), false)
  assert.equal(redacted.includes('customer@example.com'), false)
  assert.equal(redactDiagnosticText('Authorization: Bearer tok_live cookie: sid=1').includes('tok_live'), false)
  console.log('✓ diagnostic evidence redacts secrets and PII')

  const tracker = new DiagnosticBudgetTracker({ maxSteps: 2, maxToolCalls: 1, maxRuntimeMs: 5000 })
  assert.equal(tracker.consumeStep('a').ok, true)
  assert.equal(tracker.consumeStep('b').ok, true)
  const exhausted = tracker.consumeStep('c')
  assert.equal(exhausted.ok, false)
  assert.match(exhausted.reason ?? '', /Diagnostic budget exhausted/)
  console.log('✓ diagnostic budget exhaustion stops the loop')

  const model = selectModel({ taskType: 'diagnostic', complexity: 'complex', risk: 'high' })
  assert.equal(model.model, MODELS.GPT_LUNA)
  assert.equal(model.escalated, false)
  console.log('✓ model router keeps current Luna behavior')

  const failedDiag = await runDiagnostic({
    problem: 'Why is revenue showing zero?',
    persist: false,
    budget: { maxSteps: 1, maxToolCalls: 0, maxRuntimeMs: 2000 },
  })
  assert.equal(failedDiag.budget_exhausted, true)
  assert.match(failedDiag.resolution ?? '', /Diagnostic budget exhausted/)
  console.log('✓ failed diagnostic reports budget exhaustion')

  const okDiag = await runDiagnostic({
    problem: 'Why did you not execute the task?',
    persist: false,
    budget: { maxSteps: 16, maxToolCalls: 8, maxRuntimeMs: 20000 },
  })
  assert.ok(okDiag.incident_id.startsWith('JARVIS-'))
  assert.ok(okDiag.diagnostic_steps.length > 0)
  assert.equal(okDiag.budget_exhausted, false)
  const codeFixes = okDiag.proposed_fix.filter((f) => f.kind === 'code_change')
  if (codeFixes.length) {
    assert.ok(codeFixes.every((f) => f.permission === 'require_approval'))
    assert.ok(okDiag.regression_tests.length >= 0)
  }
  console.log('✓ successful diagnostic produces a report without applying code')
}

function testReasoningBoundaries() {
  // 1) Shopify cannot explain LURVOX Razorpay revenue
  assert.equal(shouldLoadShopifyForQuestion('How has my business been going over the last 2 days?'), false)
  assert.equal(shouldLoadShopifyForQuestion('What is my LURVOX revenue today?'), false)
  assert.equal(shouldLoadShopifyForQuestion('How much did my Shopify store make today?'), true)
  assert.equal(
    recommendsShopifyLurvoxReconcile(
      'Reconcile LURVOX Razorpay revenue against Shopify orders to explain the gap.'
    ),
    true
  )
  assert.equal(
    recommendsShopifyLurvoxReconcile('Shopify ₹0 explains why LURVOX revenue looks off today.'),
    true
  )
  assert.equal(
    recommendsShopifyLurvoxReconcile(
      'LURVOX revenue is from public.purchases. Shopify Admin is a separate commerce source.'
    ),
    false
  )
  assert.match(separateCommerceSystemsNote(), /public\.purchases/)
  assert.match(separateCommerceSystemsNote(), /Shopify Admin/)
  assert.match(separateCommerceSystemsNote(), /marketing_performance/)
  assert.equal(sourceAllowedForMetric(LURVOX_PRODUCT_REVENUE_METRIC, 'shopify'), false)
  console.log('✓ Shopify cannot explain LURVOX Razorpay revenue')

  // 2) No funnel assignment from purchase price alone
  const funnels = [
    { id: 'f99', price_inr: 99, name: '₹99' },
    { id: 'f1699', price_inr: 1699, name: '₹1,699' },
  ]
  assert.equal(funnelIdFromPurchaseAmount(999, funnels).funnel_id, null)
  assert.equal(funnelIdFromPurchaseAmount(99, funnels).funnel_id, null)
  assert.equal(funnelIdFromPurchaseAmount(1699, funnels).funnel_id, null)
  assert.match(funnelIdFromPurchaseAmount(999, funnels).reason, /Purchase amount alone|unavailable/i)
  console.log('✓ no funnel assignment from purchase price alone')

  // 3) Missing Meta sync triggers investigation path (not Shopify revenue)
  assert.equal(
    shouldInvestigateMetaSyncFirst({
      question: 'Why is Meta performance unavailable?',
      lastSyncAt: null,
      metaConfigured: true,
    }),
    true
  )
  assert.equal(
    shouldInvestigateMetaSyncFirst({
      question: 'Investigate Meta ads spend',
      lastSyncAt: null,
    }),
    true
  )
  assert.equal(classifyProblem('Why is Meta performance missing?').kind, 'meta_missing')
  assert.equal(resolveDiagnosticKind('Why is Meta sync unavailable?'), 'meta_missing')
  assert.equal(classifyProblem('Why is revenue showing zero?').kind, 'why')
  assert.equal(classifyProblem('Why is Shopify revenue showing zero?').kind, 'shopify_revenue')
  console.log('✓ missing Meta sync triggers investigation path')

  // 5) Completed investigation clears working state
  assert.equal(
    investigationTimelineIsActive(
      [
        { state: 'done' },
        { state: 'done' },
        { state: 'done' },
      ],
      false
    ),
    false
  )
  assert.equal(
    investigationTimelineIsActive([{ state: 'active' }, { state: 'pending' }], false),
    true
  )
  assert.equal(investigationTimelineIsActive([], true), true)
  assert.equal(operatorTimelineStateForIdleActivity('ANALYSIS'), 'Completed')
  assert.equal(operatorTimelineStateForIdleActivity('RESEARCH'), 'Completed')
  const idleCockpit = presentCockpit({
    tasks: [{ id: 't1', objective: 'Investigate Meta', status: 'completed' }],
    activity: [
      {
        id: 'a1',
        at: '2026-09-21T00:00:00.000Z',
        kind: 'ANALYSIS',
        title: 'Investigation finished',
        detail: 'done',
      },
    ],
    pulse: {
      today: {
        revenue: { value: 100, display: '₹100', status: 'ok', source: 'public.purchases', hint: '' },
        orders: { value: 1, display: '1', status: 'ok', source: 'public.purchases', hint: '' },
        ad_spend: { value: null, display: 'n/a', status: 'no_data', source: 'meta', hint: '' },
      },
    },
  })
  assert.equal(idleCockpit.active_work.state, 'Idle')
  assert.ok(idleCockpit.operator_timeline.every((e) => e.state !== 'Analyzing'))
  console.log('✓ completed investigation clears working state')

  // 6) Raw tool names excluded from final operator response
  const dirty = `Conclusion: Meta sync has not completed.

Evidence: lastSyncAt is null.

analytics.today_overview
system.pending_approvals
system.cost_status
`
  const clean = stripRawToolNamesFromReply(dirty)
  assert.equal(containsRawToolName(clean), false)
  assert.equal(clean.includes('analytics.today_overview'), false)
  assert.equal(clean.includes('system.pending_approvals'), false)
  assert.equal(clean.includes('system.cost_status'), false)
  assert.match(clean, /Conclusion/)
  console.log('✓ raw tool names are excluded from final operator response')
}

function testOperatorReplyCompression() {
  assert.equal(userRequestedDetail('Show me the full diagnostic evidence'), true)
  assert.equal(userRequestedDetail('How is the business doing?'), false)
  assert.equal(detectOperatorReplyMode('How is the business doing today?'), 'business')
  assert.equal(detectOperatorReplyMode('Why is Meta performance unavailable?'), 'investigation')
  assert.equal(detectOperatorReplyMode('Pause this ad', { hasApprovals: true }), 'approval')
  assert.equal(detectOperatorReplyMode('Show me everything about Meta'), 'detailed')

  const longMeta = `Based on the available evidence, Meta is unavailable for decisions.
Furthermore, Meta performance cannot be evaluated today.
It is important to note that Meta is not decision-grade.
Meta cannot be used for funnel budgeting.
Therefore, it should be emphasized that Meta is unavailable.

## Diagnostic stages
1. Credential check passed with many details about env vars and scopes.
2. Ad account probe returned account status and name and more narrative.
3. Campaigns probe returned sample ids and paging cursors and more.
4. Insights probe returned yesterday spend fields and actions arrays.
5. Sync history showed null lastSyncAt and empty audit rows and repeated explanations.
6. Health checks across openai supabase shopify brave video cron workers memory events.
7. Source of truth explanations for purchases Shopify Admin and marketing_performance repeated.
8. Test plan with unit integration regression staging production verification steps.

## Recommendation
Run a controlled sync.
Also consider reviewing the scheduler.
Also consider reviewing the worker.
Also consider reviewing persistence.
Also consider reviewing parsing.
Also document every unavailable field again.
Also restate that Meta is unavailable once more for clarity.

analytics.today_overview
system.pending_approvals
system.cost_status
`

  const compressed = compressOperatorReply(longMeta, { mode: 'investigation' })
  assert.ok(countWords(compressed) <= OPERATOR_REPLY_HARD_WORD_LIMIT)
  assert.match(compressed, /## Finding/i)
  assert.match(compressed, /## Evidence/i)
  assert.match(compressed, /## Next step/i)
  assert.equal(containsRawToolName(compressed), false)
  assert.equal(/Based on the available evidence/i.test(compressed), false)
  assert.equal(/Furthermore/i.test(compressed), false)
  // Meta unavailable theme should not be restated endlessly
  const metaMentions = compressed.toLowerCase().split('meta').length - 1
  assert.ok(metaMentions <= 6)

  const presented = presentOperatorReply({
    userMessage: 'Why is Meta performance unavailable?',
    draft: longMeta,
  })
  assert.equal(presented.mode, 'investigation')
  assert.ok(presented.word_count <= OPERATOR_REPLY_HARD_WORD_LIMIT)
  assert.equal(presented.compressed, true)

  const detailed = presentOperatorReply({
    userMessage: 'Show me the full diagnostic evidence',
    draft: longMeta,
  })
  assert.equal(detailed.mode, 'detailed')
  assert.ok(detailed.word_count > presented.word_count)

  const business = compressOperatorReply(
    `## Bottom line
Revenue is fine.

## What I found
- One
- Two
- Three
- Four
- Five

## What needs attention
- A
- B
- C

## Next step
Watch Meta sync.`,
    { mode: 'business' }
  )
  const foundSection = business.split(/## What needs attention/i)[0]
  const foundBullets = (foundSection.match(/^-\s+/gm) || []).length
  assert.ok(foundBullets <= 3)
  console.log('✓ operator reply compression keeps brief owner-facing answers')
}

async function testMetaSyncPipelineHonesty() {
  assert.equal(classifyProblem('Meta performance unavailable lastSyncAt null').kind, 'meta_missing')

  const trace = await investigateMetaSyncPipeline('Why is Meta performance unavailable?', {
    skipLiveProbes: true,
  })
  assert.ok(trace.evidence.some((e) => e.system === 'meta.config' || e.system.startsWith('meta.')))
  assert.match(trace.root.summary, /lastSyncAt|not configured|sync/i)
  assert.equal(/token expired|permission denied by facebook|broken pixel/i.test(trace.root.summary), false)
  if (trace.root.confidence === 'low' || trace.root.summary.toLowerCase().includes('unknown')) {
    assert.match(trace.root.summary, /unknown|not invented|no verified successful sync|credentials/i)
  }
  console.log('✓ unsupported Meta cause is not invented')
}

function mockMetaClient(handlers: {
  get: (path: string) => Promise<unknown>
}): MetaGraphClient {
  return {
    credentials: {
      accessToken: 'TEST_TOKEN_SHOULD_NEVER_APPEAR',
      adAccountId: 'act_123',
      apiVersion: 'v22.0',
    },
    timeoutMs: 50,
    get: async (path) => handlers.get(path) as never,
    post: async () => {
      throw new Error('POST not used in sync tests')
    },
  }
}

function memorySyncDeps(state: {
  last_sync_at: string | null
  last_sync_error: string | null
  performance: Record<string, unknown>[]
  audits: unknown[]
}): MetaSyncDeps {
  let campaignN = 0
  let adsetN = 0
  let adN = 0
  return {
    persistPerformanceRow: async (payload) => {
      state.performance.push(payload)
    },
    writeAudit: async (event) => {
      state.audits.push(event)
      return 'audit-1'
    },
    updateMetaIntegrationSetting: async (value) => {
      if ('last_sync_at' in value) state.last_sync_at = value.last_sync_at ?? null
      if ('last_sync_error' in value) state.last_sync_error = value.last_sync_error ?? null
    },
    getMetaIntegrationSetting: async () => ({
      last_sync_at: state.last_sync_at,
      last_sync_error: state.last_sync_error,
    }),
    lookupAdCreativeId: async () => null,
    upsertCampaign: async (row) => {
      campaignN += 1
      return { id: `camp-${campaignN}`, funnel_id: null }
    },
    upsertAdset: async () => {
      adsetN += 1
      return `adset-${adsetN}`
    },
    upsertAd: async () => {
      adN += 1
      return `ad-${adN}`
    },
  }
}

function happyPathClient(): MetaGraphClient {
  return mockMetaClient({
    get: async (path) => {
      if (path.includes('/campaigns')) {
        return {
          data: [{ id: 'c1', name: 'Camp', status: 'ACTIVE', objective: 'OUTCOME_SALES' }],
        }
      }
      if (path.includes('/adsets')) {
        return {
          data: [{ id: 'as1', name: 'Adset', status: 'ACTIVE', campaign_id: 'c1', daily_budget: '50000' }],
        }
      }
      if (path.includes('/ads')) {
        return {
          data: [{ id: 'ad1', name: 'Ad', status: 'ACTIVE', adset_id: 'as1', campaign_id: 'c1' }],
        }
      }
      if (path.includes('/insights')) {
        return {
          data: [
            {
              campaign_id: 'c1',
              adset_id: 'as1',
              ad_id: 'ad1',
              spend: '100',
              impressions: '1000',
              reach: '800',
              clicks: '40',
              date_start: '2026-09-20',
              date_stop: '2026-09-20',
              actions: [{ action_type: 'purchase', value: '1' }],
              action_values: [{ action_type: 'purchase', value: '99' }],
            },
          ],
        }
      }
      if (path.startsWith('/act_')) {
        return { id: 'act_123', name: 'Test', account_status: 1 }
      }
      return { data: [] }
    },
  })
}

async function testMetaSyncStageBounds() {
  assert.equal(DIAGNOSTIC_META_SYNC_BOUNDS.maxPages, 1)
  assert.equal(DIAGNOSTIC_META_SYNC_BOUNDS.maxRetries, 0)
  assert.equal(DIAGNOSTIC_META_SYNC_BOUNDS.datePreset, 'yesterday')

  // pagination limit
  let pages = 0
  const pagingClient = mockMetaClient({
    get: async () => {
      pages += 1
      return {
        data: [{ id: `x${pages}` }],
        paging: { cursors: { after: `cursor${pages}` } },
      }
    },
  })
  const paged = await fetchPagesBounded(pagingClient, '/act_123/campaigns', { limit: '1' }, 2)
  assert.equal(paged.page_count, 2)
  assert.equal(paged.items.length, 2)
  assert.equal(pages, 2)
  console.log('✓ pagination limit')

  // bounded retry
  let tries = 0
  await assert.rejects(
    () =>
      withBoundedRetry(async () => {
        tries += 1
        throw new Error('boom')
      }, 0),
    /boom/
  )
  assert.equal(tries, 1)
  tries = 0
  const ok = await withBoundedRetry(async () => {
    tries += 1
    if (tries < 2) throw new Error('once')
    return 'done'
  }, 1)
  assert.equal(ok, 'done')
  assert.equal(tries, 2)
  console.log('✓ bounded retry behavior')

  assert.equal(classifyMetaSyncError(new Error('timed out after 15000ms')), 'timeout')
  assert.equal(classifyMetaSyncError(new Error('parse: invalid insight row')), 'parse')
  assert.equal(classifyMetaSyncError(new Error('persistence: upsert failed')), 'persistence')

  const prevToken = process.env.META_ADS_ACCESS_TOKEN
  const prevAccount = process.env.META_ADS_AD_ACCOUNT_ID
  process.env.META_ADS_ACCESS_TOKEN = 'TEST_TOKEN_SHOULD_NEVER_APPEAR'
  process.env.META_ADS_AD_ACCOUNT_ID = 'act_123'

  // campaign request timeout
  {
    const state = {
      last_sync_at: '2026-01-01T00:00:00.000Z',
      last_sync_error: null as string | null,
      performance: [] as Record<string, unknown>[],
      audits: [] as unknown[],
    }
    const client = mockMetaClient({
      get: async (path) => {
        if (path.includes('/campaigns')) {
          throw new MetaApiError('Meta API GET /campaigns timed out after 50ms', 408)
        }
        return { id: 'act_123', name: 'Test', account_status: 1 }
      },
    })
    const result = await syncMetaMarketingData({
      mode: 'diagnostic',
      client,
      deps: memorySyncDeps(state),
    })
    assert.equal(result.ok, false)
    assert.equal(result.failed_stage, 'CAMPAIGN_FETCH')
    assert.equal(result.last_sync_at_updated, false)
    assert.equal(state.last_sync_at, '2026-01-01T00:00:00.000Z')
    assert.ok(state.audits.length >= 1)
    const dump = JSON.stringify(result.trace)
    assert.equal(dump.includes('TEST_TOKEN_SHOULD_NEVER_APPEAR'), false)
  }
  console.log('✓ campaign request timeout + failed sync does NOT update lastSyncAt')

  // insights request timeout
  {
    const state = {
      last_sync_at: '2026-01-01T00:00:00.000Z',
      last_sync_error: null as string | null,
      performance: [] as Record<string, unknown>[],
      audits: [] as unknown[],
    }
    const client = mockMetaClient({
      get: async (path) => {
        if (path.includes('/insights')) {
          throw new MetaApiError('Meta API GET /insights timed out after 50ms', 408)
        }
        if (path.includes('/campaigns')) {
          return { data: [{ id: 'c1', name: 'Camp', status: 'ACTIVE' }] }
        }
        if (path.includes('/adsets')) {
          return { data: [{ id: 'as1', name: 'A', status: 'ACTIVE', campaign_id: 'c1' }] }
        }
        if (path.includes('/ads')) {
          return { data: [{ id: 'ad1', name: 'Ad', status: 'ACTIVE', adset_id: 'as1', campaign_id: 'c1' }] }
        }
        return { id: 'act_123', name: 'Test', account_status: 1 }
      },
    })
    const result = await syncMetaMarketingData({
      mode: 'diagnostic',
      client,
      deps: memorySyncDeps(state),
    })
    assert.equal(result.ok, false)
    assert.equal(result.failed_stage, 'INSIGHTS_FETCH')
    assert.equal(result.last_sync_at_updated, false)
    assert.equal(state.last_sync_at, '2026-01-01T00:00:00.000Z')
  }
  console.log('✓ insights request timeout')

  // parser failure
  {
    const state = {
      last_sync_at: null as string | null,
      last_sync_error: null as string | null,
      performance: [] as Record<string, unknown>[],
      audits: [] as unknown[],
    }
    const result = await syncMetaMarketingData({
      mode: 'diagnostic',
      client: happyPathClient(),
      deps: {
        ...memorySyncDeps(state),
        parseInsightRow: () => {
          throw new Error('bad row')
        },
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.failed_stage, 'RESPONSE_PARSING')
    assert.equal(result.last_sync_at_updated, false)
    assert.equal(state.last_sync_at, null)
  }
  console.log('✓ parser failure')

  // persistence failure
  {
    const state = {
      last_sync_at: '2026-02-01T00:00:00.000Z',
      last_sync_error: null as string | null,
      performance: [] as Record<string, unknown>[],
      audits: [] as unknown[],
    }
    const result = await syncMetaMarketingData({
      mode: 'diagnostic',
      client: happyPathClient(),
      deps: {
        ...memorySyncDeps(state),
        persistPerformanceRow: async () => {
          throw new Error('persistence: marketing_performance upsert failed: boom')
        },
      },
    })
    assert.equal(result.ok, false)
    assert.equal(result.failed_stage, 'PERFORMANCE_PERSISTENCE')
    assert.equal(result.last_sync_at_updated, false)
    assert.equal(state.last_sync_at, '2026-02-01T00:00:00.000Z')
    assert.equal(state.performance.length, 0)
  }
  console.log('✓ persistence failure')

  // successful minimal sync
  {
    const state = {
      last_sync_at: null as string | null,
      last_sync_error: null as string | null,
      performance: [] as Record<string, unknown>[],
      audits: [] as unknown[],
    }
    const result = await runDiagnosticMetaSync({
      client: happyPathClient(),
      deps: memorySyncDeps(state),
    })
    assert.equal(result.ok, true)
    assert.equal(result.failed_stage, null)
    assert.equal(result.api_ok, true)
    assert.equal(result.persistence_ok, true)
    assert.equal(result.last_sync_at_updated, true)
    assert.equal(result.audit_written, true)
    assert.ok(state.performance.length >= 1)
    assert.ok(state.audits.length >= 1)
    assert.ok(state.last_sync_at)
    assert.ok(result.trace?.stages.every((s) => s.status === 'ok' || s.status === 'skipped'))
    const dump = JSON.stringify({ result, state })
    assert.equal(dump.includes('TEST_TOKEN_SHOULD_NEVER_APPEAR'), false)
    assert.equal(dump.toLowerCase().includes('authorization'), false)
  }
  console.log('✓ successful sync DOES update lastSyncAt + audit + performance rows')
  console.log('✓ tokens/secrets never appear in diagnostics')

  // stage tracker records durations
  const tracker = new MetaSyncStageTracker('diagnostic')
  tracker.begin('START')
  tracker.end('START', 'ok')
  const finished = tracker.finish()
  assert.equal(finished.stages[0]?.status, 'ok')
  assert.ok(finished.stages[0]?.duration_ms != null)

  if (prevToken === undefined) delete process.env.META_ADS_ACCESS_TOKEN
  else process.env.META_ADS_ACCESS_TOKEN = prevToken
  if (prevAccount === undefined) delete process.env.META_ADS_AD_ACCOUNT_ID
  else process.env.META_ADS_AD_ACCOUNT_ID = prevAccount

  console.log('✓ meta sync stage-level bounds and failure semantics')
}

testForbiddenTools()
testJarvisPlanNormalization()
testBudgets()
testOperatorPresentation()
testToolRegistry()
testFunnelSeparationInCatalog()
testMetricSourceOfTruthCatalog()
testLurvoxPurchaseLedger()
testSharedIstBusinessCalendar()
testQuickCommands()
testCockpitPresentation()
testReasoningBoundaries()
testOperatorReplyCompression()
testResearchConfig()
testShopifyBlocked()
void testVideoProvider()
  .then(() => testPermissionEngine())
  .then(() => testIntegrationsHonesty())
  .then(() => testDiagnostics())
  .then(() => testMetaSyncPipelineHonesty())
  .then(() => testMetaSyncStageBounds())
  .then(() => {
    console.log('\nAll Jarvis unit checks passed.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
