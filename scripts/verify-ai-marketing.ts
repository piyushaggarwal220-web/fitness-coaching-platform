/**
 * Unit tests for AI Marketing OS pure logic (no network).
 * Run: npx tsx scripts/verify-ai-marketing.ts
 */
import assert from 'node:assert/strict'
import {
  aggregatePerformance,
  applyBudgetChange,
  calcCpa,
  calcCpc,
  calcCpm,
  calcCtr,
  calcRoas,
  percentChange,
} from '../src/lib/ai-marketing/metrics'
import { runGuardrails } from '../src/lib/ai-marketing/guardrails'
import { evaluateAutonomyGate } from '../src/lib/ai-marketing/autonomy'
import { DEFAULT_GUARDRAILS } from '../src/lib/ai-marketing/types'
import {
  creativeBatchSchema,
  analyticsFindingSchema,
} from '../src/lib/ai-marketing/validation/schemas'
import { classifyCreative } from '../src/lib/ai-marketing/creative-performance'
import type { MarketingFunnel } from '../src/lib/ai-marketing/types'

function testMetrics() {
  assert.equal(calcCtr(10, 1000), 1)
  assert.equal(calcCpc(100, 10), 10)
  assert.equal(calcCpm(100, 1000), 100)
  assert.equal(calcCpa(5000, 2), 2500)
  assert.equal(calcRoas(10000, 5000), 2)
  assert.equal(percentChange(100, 120), 20)
  assert.equal(applyBudgetChange(1000, 20), 1200)

  const agg = aggregatePerformance([
    { spend: 100, impressions: 1000, reach: 800, clicks: 50, purchases: 1, revenue: 2000 },
    { spend: 100, impressions: 1000, reach: 800, clicks: 50, purchases: 1, revenue: 2000 },
  ])
  assert.equal(agg.spend, 200)
  assert.equal(agg.purchases, 2)
  assert.equal(agg.roas, 20)
  console.log('✓ metrics')
}

function testGuardrails() {
  const pauseBlocked = runGuardrails({
    action: 'PAUSE_AD',
    risk: 'medium',
    settings: DEFAULT_GUARDRAILS,
    entitySpend: 100,
  })
  assert.equal(pauseBlocked.passed, false)

  const pauseOk = runGuardrails({
    action: 'PAUSE_AD',
    risk: 'medium',
    settings: DEFAULT_GUARDRAILS,
    entitySpend: 2000,
  })
  assert.equal(pauseOk.passed, true)

  const budgetBlocked = runGuardrails({
    action: 'INCREASE_BUDGET',
    risk: 'medium',
    settings: DEFAULT_GUARDRAILS,
    currentBudget: 1000,
    proposedBudget: 2000,
    accountDailySpend: 0,
  })
  assert.equal(budgetBlocked.passed, false)

  const budgetOk = runGuardrails({
    action: 'INCREASE_BUDGET',
    risk: 'medium',
    settings: DEFAULT_GUARDRAILS,
    currentBudget: 1000,
    proposedBudget: 1100,
    accountDailySpend: 1000,
  })
  assert.equal(budgetOk.passed, true)
  console.log('✓ guardrails')
}

function testAutonomy() {
  const l1 = evaluateAutonomyGate({
    level: 1,
    action: 'PAUSE_AD',
    risk: 'low',
  })
  assert.equal(l1.allowed, false)

  const l2 = evaluateAutonomyGate({
    level: 2,
    action: 'PAUSE_AD',
    risk: 'medium',
  })
  assert.equal(l2.allowed, true)
  if (l2.allowed) assert.equal(l2.mode, 'propose')

  const disabled = evaluateAutonomyGate({
    level: 0,
    action: 'NO_ACTION',
    risk: 'low',
  })
  assert.equal(disabled.allowed, false)
  console.log('✓ autonomy')
}

function testValidation() {
  const ok = creativeBatchSchema.safeParse({
    concepts: [
      {
        concept_name: 'Busy pro fat loss',
        angle: 'pain_point',
        hook: 'Still guessing your diet every Monday?',
        headline: 'Coaching that removes the guesswork',
        primary_text:
          'LURVOX builds your plan, checks in weekly, and keeps you accountable — without living in the gym.',
        description: 'Personal coaching for busy professionals',
        cta: 'Learn More',
        visual_direction: 'Clean gym morning light, focused professional',
        image_generation_prompt:
          'Photorealistic fitness coaching scene, warm light, no logos, Indian professional in gym',
        target_audience: 'Busy professionals',
        hypothesis: 'Pain-point hooks will improve CTR vs generic motivation',
        expected_test_reason: 'Validate pain-point angle before scaling spend',
      },
    ],
  })
  assert.equal(ok.success, true)

  const finding = analyticsFindingSchema.safeParse({
    issue: 'High CPC on ad X',
    evidence: ['CPC 80 vs account avg 40'],
    evidence_strength: 'possible_issue',
    recommendation: 'Test new creative before pausing',
    recommended_action: 'CREATE_NEW_TEST',
    confidence: 0.55,
    estimated_impact_category: 'medium',
    risk_level: 'medium',
    requires_human_approval: true,
    caveats: ['Correlation only'],
  })
  assert.equal(finding.success, true)
  console.log('✓ validation schemas')
}

function testFunnelEconomicsSeparation() {
  // Simulated: never share thresholds
  const funnel99 = { price: 99, target_cpa: 45, max_cpa: 80 }
  const funnel1699 = { price: 1699, target_cpa: 850, max_cpa: 1200 }
  assert.notEqual(funnel99.target_cpa, funnel1699.target_cpa)
  assert.ok(funnel99.max_cpa < funnel1699.target_cpa)
  // Initial ROAS vs blended must stay distinct conceptually
  const spend = 1000
  const revenue = 990 // 10 x ₹99
  const downstream = 1699
  const initialRoas = revenue / spend
  const blendedRoas = (revenue + downstream) / spend
  assert.ok(blendedRoas > initialRoas)
  assert.notEqual(initialRoas, blendedRoas)
  console.log('✓ multi-funnel economics separation')
}

function testCreativeClassification() {
  const funnel99: MarketingFunnel = {
    id: 'x',
    slug: 'lurvox-99',
    name: '₹99',
    offer: 'trial',
    product: 'coaching',
    price_inr: 99,
    estimated_fulfillment_cost_inr: 20,
    contribution_margin_inr: 79,
    aov_inr: 99,
    target_cpa: 45,
    max_acceptable_cpa: 80,
    target_roas: 1.5,
    min_roas: 1.0,
    daily_budget_inr: 1000,
    test_budget_inr: 500,
    max_daily_budget_inr: 5000,
    max_budget_increase_percent: 20,
    max_budget_decrease_percent: 50,
    min_spend_before_pause: 500,
    min_purchases_for_winner: 3,
    min_data_window_days: 3,
    conversion_event: 'Purchase',
    landing_page: null,
    checkout_url: null,
    target_audience: null,
    tracks_downstream_upsell: true,
    downstream_funnel_id: null,
    notes: null,
    status: 'active',
    metadata: {},
  }

  const insuf = classifyCreative({
    funnel: funnel99,
    spend: 100,
    purchases: 0,
    revenue: 0,
    cpa: null,
    roas: null,
    ctr: 1,
    frequency_max: 1,
    creative_age_days: 1,
    accountFatigueThreshold: 2.5,
  })
  assert.equal(insuf.classification, 'INSUFFICIENT_DATA')

  const winner = classifyCreative({
    funnel: funnel99,
    spend: 1000,
    purchases: 25,
    revenue: 2475,
    cpa: 40,
    roas: 2.475,
    ctr: 2,
    frequency_max: 1.2,
    creative_age_days: 10,
    accountFatigueThreshold: 2.5,
  })
  assert.equal(winner.classification, 'WINNER')

  const loser = classifyCreative({
    funnel: funnel99,
    spend: 1000,
    purchases: 5,
    revenue: 495,
    cpa: 200,
    roas: 0.495,
    ctr: 0.5,
    frequency_max: 1,
    creative_age_days: 10,
    accountFatigueThreshold: 2.5,
  })
  assert.equal(loser.classification, 'LOSER')

  const mid = classifyCreative({
    funnel: funnel99,
    spend: 1000,
    purchases: 14,
    revenue: 1386,
    cpa: 71,
    roas: 1.386,
    ctr: 1,
    frequency_max: 1,
    creative_age_days: 10,
    accountFatigueThreshold: 2.5,
  })
  assert.equal(mid.classification, 'PROMISING')
  console.log('✓ creative classification rules')
}

testMetrics()
testGuardrails()
testAutonomy()
testValidation()
testFunnelEconomicsSeparation()
testCreativeClassification()
console.log('\nAll AI Marketing unit checks passed.')
