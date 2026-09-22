/**
 * Phases 15–20 offline verification — no live Meta/IG writes.
 */
import assert from 'node:assert/strict'
import {
  scoreOpportunity,
  derivePriority,
  cpaSpendScenario,
  opportunityBusinessFingerprint,
} from '../src/lib/jarvis/opportunities'
import { validateHypothesis, assessDataSufficiency } from '../src/lib/jarvis/experiments'
import { financeScenario } from '../src/lib/jarvis/finance'
import { growthScenario } from '../src/lib/jarvis/growth'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateExecutionPolicy } from '../src/lib/jarvis/execution/policy/evaluate'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'
import type { PolicyFacts } from '../src/lib/jarvis/execution/policy/types'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

function basePolicy(overrides: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    tool_name: 'meta.increase_budget',
    action_class: 'AD_BUDGET_INCREASE',
    system: 'META',
    risk_class: 'SIGNIFICANT',
    risk_level: 'high',
    estimated_cost_usd: 0.1,
    money_impact_usd: 500,
    percent_change: 20,
    autonomy_level: 4,
    source: 'chat',
    approved_execution: false,
    live_meta_enabled: false,
    live_instagram_publishing: false,
    shopify_writes_enabled: true,
    video_publish_enabled: false,
    execution_kill_switch: false,
    execution_mode: 'approval',
    dry_run: false,
    shadow_mode: false,
    canary_enabled: false,
    reversibility: 'REVERSIBLE',
    recent_failures: 0,
    duplicate_running: false,
    already_succeeded: false,
    ...overrides,
  }
}

async function main() {
  // Phase 15
  {
    const score = scoreOpportunity({
      impact: 'HIGH',
      confidence: 'MEDIUM',
      evidence_strength: 'MODERATE',
      urgency: 'HIGH',
      actionability: 'MEDIUM',
      freshness: 'FRESH',
    })
    assert.equal(derivePriority(score), 'HIGH')
    assert.ok(score.note.includes('not a percentage'))
    const fp1 = opportunityBusinessFingerprint({
      type: 'MARKETING_EFFICIENCY',
      funnel_id: 'f99',
      key: 'cpa',
    })
    const fp2 = opportunityBusinessFingerprint({
      type: 'MARKETING_EFFICIENCY',
      funnel_id: 'f1699',
      key: 'cpa',
    })
    assert.notEqual(fp1, fp2)
    const scen = cpaSpendScenario({ spend_inr: 10000, cpa_inr: 500, cpa_change_pct: -10 })
    assert.equal(scen.label, 'SCENARIO')
    assert.ok(scen.scenario.purchases != null && scen.scenario.purchases > scen.baseline.purchases!)
    const missing = cpaSpendScenario({ spend_inr: null, cpa_inr: null, cpa_change_pct: 10 })
    assert.equal(missing.scenario.purchases, null)
    ok('Phase 15: scoring, funnel fingerprint isolation, scenario uncertainty')
  }

  // Phase 16 — types/tools presence
  {
    ensureJarvisToolsRegistered()
    assert.ok(getTool('strategy.goals'))
    assert.ok(getTool('strategy.replan'))
    assert.ok(getTool('strategy.health'))
    ok('Phase 16: strategy tools registered')
  }

  // Phase 17
  {
    assert.ok(getTool('growth.snapshot'))
    assert.ok(getTool('growth.funnel_analysis'))
    const g = growthScenario({ spend_inr: 5000, cpa_inr: 250, cpa_change_pct: 0 })
    assert.equal(g.label, 'SCENARIO')
    assert.ok(Array.isArray(g.coordinated_proposal_example))
    ok('Phase 17: growth tools + coordinated proposal is plan-only')
  }

  // Phase 18
  {
    assert.ok(getTool('content.strategy'))
    assert.ok(getTool('content.fatigue'))
    assert.ok(getTool('content.performance'))
    assert.equal(getTool('content.publish'), undefined)
    ok('Phase 18: content intel tools; no duplicate publish')
  }

  // Phase 19
  {
    assert.ok(getTool('finance.snapshot'))
    const s = financeScenario({
      spend_inr: 10000,
      cpa_inr: 200,
      spend_change_pct: 20,
      cpa_change_pct: 0,
    })
    assert.equal(s.label, 'SCENARIO')
    assert.ok(String(s.note).includes('Not a prediction'))
    ok('Phase 19: finance scenario math')
  }

  // Phase 20
  {
    assert.equal(validateHypothesis('just try something').ok, false)
    assert.equal(
      validateHypothesis(
        'If we raise budget gradually, then CPA may stay stable, because auction learning needs time'
      ).ok,
      true
    )
    assert.equal(
      assessDataSufficiency({
        purchases: 1,
        spend: 50,
        minimum_purchases: 5,
        minimum_spend: 500,
      }),
      'INSUFFICIENT'
    )
    assert.equal(
      assessDataSufficiency({
        purchases: 10,
        spend: 2000,
        minimum_purchases: 5,
        minimum_spend: 500,
      }),
      'STRONG'
    )
    assert.ok(getTool('experiments.create'))
    assert.ok(getTool('experiments.conclude'))
    assert.equal(getTool('experiments.execute_meta'), undefined)
    ok('Phase 20: hypothesis quality + data sufficiency + tools')
  }

  // Safety / Phase 12
  {
    assert.ok(getTool('opportunities.list'))
    assert.equal(getTool('opportunities.execute'), undefined)
    const gate = evaluateExecutionPolicy(basePolicy())
    assert.notEqual(gate.decision, 'AUTO_EXECUTE')
    assert.equal(liveMetaExecutionEnabled(), false)
    assert.equal(liveInstagramPublishingEnabled(), false)
    ok('Safety: no opp execute tool; Phase 12 authoritative; live flags OFF')
  }

  console.log('\nPhases 15–20 verification passed (offline).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
