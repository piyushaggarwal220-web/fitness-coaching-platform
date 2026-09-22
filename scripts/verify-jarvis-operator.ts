/**
 * Phase 2 Jarvis Business Operator verification (mostly offline).
 * Run: npm run verify:jarvis-operator
 */
import assert from 'node:assert/strict'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool, FORBIDDEN_TOOL_NAMES } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'
import {
  INVESTIGATION_PATTERNS,
  matchInvestigationPattern,
} from '../src/lib/jarvis/operator/investigations/patterns'
import { buildOperatorPlanForIntent } from '../src/lib/jarvis/operator/planner'
import {
  verifyAfterWrite,
  formatVerificationForOperator,
} from '../src/lib/jarvis/core/verify-after-write'
import { buildApprovalBriefing } from '../src/lib/jarvis/permissions/approval-briefing'
import { detectProactiveFindings } from '../src/lib/jarvis/workers/proactive'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'
import { LURVOX_PRODUCT_REVENUE, SHOPIFY_STORE_COMMERCE } from '../src/lib/jarvis/metrics/source-of-truth'
import { videoOperator, researchOperator } from '../src/lib/jarvis/operator/facades'
import { selectToolFamiliesForObjective } from '../src/lib/jarvis/tools/selection'
import { validateMemoryWrite } from '../src/lib/jarvis/memory/kinds'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

ensureJarvisToolsRegistered()

// --- Patterns ---
{
  const ids = new Set(INVESTIGATION_PATTERNS.map((p) => p.id))
  for (const required of [
    'business_health',
    'sales_drop',
    'ad_performance',
    'funnel_performance',
    'instagram_performance',
    'shopify_performance',
    'daily_report',
    'weekly_report',
  ] as const) {
    assert.ok(ids.has(required), `missing pattern ${required}`)
  }
  assert.equal(matchInvestigationPattern('Why are sales down?')?.id, 'sales_drop')
  assert.equal(matchInvestigationPattern('How is the business doing today?')?.id, 'business_health')
  assert.equal(matchInvestigationPattern('Check the ₹99 funnel')?.id, 'funnel_performance')
  assert.equal(matchInvestigationPattern('Check Instagram')?.id, 'instagram_performance')
  ok('investigation patterns registered + matched')
}

// --- Operator plan templates ---
{
  const plan = buildOperatorPlanForIntent({
    objective: 'Why are sales down?',
    patternId: 'sales_drop',
  })
  assert.equal(plan.version, 1)
  assert.ok(plan.steps.length >= 1)
  assert.ok(plan.steps.some((s) => s.tool === 'analytics.investigate'))
  assert.equal(plan.steps.every((s) => s.status === 'pending'), true)

  const funnelPlan = buildOperatorPlanForIntent({
    objective: 'Check the ₹99 funnel',
    patternId: 'funnel_performance',
  })
  assert.ok(funnelPlan.steps.some((s) => s.tool?.startsWith('funnels.')))
  const investigateStep = funnelPlan.steps.find((s) => s.tool === 'analytics.investigate')
  if (investigateStep?.input) {
    assert.match(String(investigateStep.input.objective || ''), /₹99/)
  }
  ok('multi-system operator plans')
}

// --- Tools ---
{
  const snap = getTool('analytics.business_snapshot')
  assert.ok(snap)
  assert.equal(snap!.riskClass, 'READ')
  const inv = getTool('analytics.investigate')
  assert.ok(inv)
  const parsed = inv!.inputSchema.safeParse({
    pattern_id: 'sales_drop',
    objective: 'Why are sales down?',
  })
  assert.equal(parsed.success, true)
  ok('business_snapshot + investigate pattern_id tools')
}

// --- Revenue / funnel separation (SOT) ---
{
  assert.notEqual(LURVOX_PRODUCT_REVENUE.metric, SHOPIFY_STORE_COMMERCE.metric)
  assert.ok(LURVOX_PRODUCT_REVENUE.do_not.some((d) => /shopify/i.test(d)))
  ok('LURVOX vs Shopify revenue sources remain separate')
}

// --- Live flags honesty ---
{
  const metaLive = liveMetaExecutionEnabled()
  const igLive = liveInstagramPublishingEnabled()
  assert.equal(typeof metaLive, 'boolean')
  assert.equal(typeof igLive, 'boolean')
  // Default / typical: publishing disabled unless explicitly true
  if (process.env.LIVE_INSTAGRAM_PUBLISHING_ENABLED !== 'true') {
    assert.equal(igLive, false)
  }
  ok(`live flags readable (meta=${metaLive}, ig=${igLive})`)
}

// --- Permissions: significant Meta write + IG publish + Shopify price ---
async function checkPermissions() {
  const pause = await evaluateToolPermission({
    toolName: 'meta.pause_ad',
    source: 'chat',
  })
  assert.equal(pause.allowed, true)
  assert.equal(pause.mode, 'require_approval')

  const publish = await evaluateToolPermission({
    toolName: 'instagram.publish',
    source: 'chat',
  })
  assert.equal(publish.allowed, true)
  assert.equal(publish.mode, 'require_approval')

  const price = await evaluateToolPermission({
    toolName: 'shopify.update_price',
    source: 'chat',
  })
  assert.equal(price.allowed, true)
  assert.equal(price.mode, 'require_approval')

  const blocked = await evaluateToolPermission({
    toolName: 'shopify.change_payment_settings',
    source: 'chat',
  })
  assert.equal(blocked.allowed, false)

  for (const name of FORBIDDEN_TOOL_NAMES) {
    const p = await evaluateToolPermission({ toolName: name, source: 'chat' })
    assert.equal(p.allowed, false)
  }
  ok('approval gating + blocked dangerous tools')
}

async function checkVerification() {
  const ctx = {
    actorId: null,
    conversationId: null,
    taskId: null,
    source: 'system' as const,
  }
  const recorded = await verifyAfterWrite({
    toolName: 'meta.increase_budget',
    riskClass: 'SIGNIFICANT',
    output: { status: 'recorded_not_executed', live_execution: false },
    ctx,
  })
  assert.equal(recorded.state, 'RECORDED_NOT_EXECUTED')
  assert.match(formatVerificationForOperator(recorded), /RECORDED_NOT_EXECUTED/)

  const ig = await verifyAfterWrite({
    toolName: 'instagram.publish',
    riskClass: 'SIGNIFICANT',
    output: { published: true, media_id: '1789' },
    ctx,
  })
  assert.equal(ig.state, 'VERIFIED')

  const video = await verifyAfterWrite({
    toolName: 'video.render',
    riskClass: 'LOW_RISK',
    output: { status: 'rendering', provider_job_id: 'abc' },
    ctx,
  })
  assert.equal(video.state, 'EXECUTED_UNVERIFIED')
  ok('action verification states')
}

async function checkDoWhatever() {
  const families = selectToolFamiliesForObjective('Do whatever you think is necessary')
  assert.ok(families.includes('SYSTEM'))
  const raise = await evaluateToolPermission({
    toolName: 'system.raise_budget',
    source: 'chat',
  })
  assert.equal(raise.allowed, false)
  ok('"do whatever" cannot bypass permission/budget tools')
}

void checkPermissions()
  .then(() => {
    const briefing = buildApprovalBriefing({
      toolName: 'meta.increase_budget',
      riskClass: 'SIGNIFICANT',
      riskLevel: 'high',
      reason: 'CPA below target',
      toolInput: { campaignId: 'x', current_budget: 250, daily_budget: 300 },
      estimatedCostUsd: 0.02,
    })
    assert.match(briefing.what, /250/)
    assert.match(briefing.what, /300/)
    assert.ok(briefing.why)
    assert.ok(briefing.risk)
    ok('approval briefing for budget change')
    return checkVerification()
  })
  .then(() => checkDoWhatever())
  .then(() => {
    const bad = validateMemoryWrite({
      kind: 'BUSINESS_FACT',
      source: 'model',
      summary: 'CPA is 45',
    })
    assert.equal(bad.ok, false)
    ok('memory still rejects hallucination facts')

    const critical = detectProactiveFindings({
      funnelPerformance: {
        byFunnel: [
          {
            funnel_name: '₹99',
            classified: true,
            spend: 2000,
            cpa: 200,
            max_acceptable_cpa: 80,
            target_cpa: 45,
            initial_roas: 0.2,
            target_roas: 1.5,
          },
        ],
        unclassified: { spend: 0 },
      },
    })
    assert.equal(critical.severity, 'CRITICAL')
    assert.equal(critical.shouldNotify, true)
    ok('proactive CRITICAL severity')

    const v = videoOperator.status()
    assert.equal(typeof v.configured, 'boolean')
    assert.ok(v.note.length > 0)
    assert.equal(typeof researchOperator.configured(), 'boolean')
    ok('video/research facades expose honest capability notes')

    const scenarios: { q: string; expectPattern: string | null }[] = [
      { q: 'How is the business doing today?', expectPattern: 'business_health' },
      { q: 'Why are sales down?', expectPattern: 'sales_drop' },
      { q: 'Check the ₹99 funnel.', expectPattern: 'funnel_performance' },
      { q: 'Research better Meta ads for our ₹99 offer.', expectPattern: 'ad_performance' },
    ]
    for (const s of scenarios) {
      const p = matchInvestigationPattern(s.q)
      assert.equal(p?.id ?? null, s.expectPattern)
    }
    const fam = selectToolFamiliesForObjective('Research better Meta ads for our ₹99 offer.')
    assert.ok(fam.includes('RESEARCH') || fam.includes('MARKETING'))
    ok('E2E scenario routing (deterministic)')

    console.log('\nAll Jarvis Phase 2 operator checks passed.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
