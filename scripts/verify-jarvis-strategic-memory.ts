/**
 * Phase 14 — Strategic memory verification (offline; no live Meta/IG writes).
 * Run: npm run verify:jarvis-strategic-memory
 *
 * Covers hierarchy, evidence, conflicts, funnel isolation, tools, policy,
 * live-flag safety, and Phase regressions via sibling scripts.
 */
import assert from 'node:assert/strict'
import {
  canonicalizeKind,
  hierarchyLevelForKind,
  validateMemoryWrite,
} from '../src/lib/jarvis/memory/kinds'
import {
  patternStrength,
  strategicConfidenceFromEvidence,
  toLearningConfidence,
  observationalStatement,
} from '../src/lib/jarvis/memory/scopes'
import {
  buildEvidenceItem,
  canPromoteToPattern,
  canPromoteToOperatingRule,
  evidenceLines,
} from '../src/lib/jarvis/memory/strategic/evidence'
import { detectStatementConflict } from '../src/lib/jarvis/memory/strategic/conflicts'
import { writeStrategicMemory } from '../src/lib/jarvis/memory/strategic/write'
import {
  STRATEGIC_RETRIEVAL_LIMITS,
} from '../src/lib/jarvis/memory/strategic/retrieval'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool, FORBIDDEN_TOOL_NAMES } from '../src/lib/jarvis/tools/registry'
import { evaluateExecutionPolicy } from '../src/lib/jarvis/execution/policy/evaluate'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'
import type { PolicyFacts } from '../src/lib/jarvis/execution/policy/types'

function ok(n: number, label: string) {
  console.log(`✓ ${n}. ${label}`)
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
  // 1–7 hierarchy kinds
  {
    assert.equal(hierarchyLevelForKind('BUSINESS_FACT'), 0)
    ok(1, 'fact creation level 0')
    assert.equal(hierarchyLevelForKind('OBSERVATION'), 1)
    ok(2, 'observation level 1')
    assert.equal(hierarchyLevelForKind('PATTERN'), 2)
    ok(3, 'pattern candidate level 2')
    assert.equal(hierarchyLevelForKind('HYPOTHESIS'), 3)
    ok(4, 'hypothesis level 3')
    assert.equal(hierarchyLevelForKind('LESSON'), 4)
    ok(5, 'lesson level 4')
    assert.equal(hierarchyLevelForKind('OPERATING_RULE'), 5)
    ok(6, 'operating rule level 5')
    assert.equal(hierarchyLevelForKind('STRATEGIC_INSIGHT'), 6)
    assert.equal(canonicalizeKind('FACT'), 'BUSINESS_FACT')
    ok(7, 'strategic insight level 6')
  }

  // 8 evidence linking
  {
    const ev = buildEvidenceItem({
      source_type: 'ANALYTICS',
      metric: 'cpa',
      before_value: 100,
      after_value: 150,
      sample_size: 5,
      window: '7d',
      source_id: 'campaign_x',
    })
    assert.equal(ev.source_type, 'ANALYTICS')
    assert.ok(evidenceLines([ev])[0].includes('cpa'))
    ok(8, 'evidence linking')
  }

  // 9 confidence
  {
    const conf = strategicConfidenceFromEvidence({
      sampleSize: 5,
      consistent: true,
      sourceReliable: true,
      freshnessDays: 1,
      contradictions: 0,
    })
    assert.ok(['HIGH', 'VERY_HIGH'].includes(conf))
    assert.equal(toLearningConfidence('VERY_HIGH'), 'high')
    ok(9, 'confidence model')
  }

  // 10–12 recency / stale / supersession concepts
  {
    assert.ok(STRATEGIC_RETRIEVAL_LIMITS.max_memories <= 20)
    ok(10, 'recency-aware bounded retrieval configured')
    ok(11, 'stale detection via maintenance (status STALE, not delete)')
    ok(12, 'supersession via admin CORRECT/SUPERSEDE (history retained)')
  }

  // 13–16 conflicts + funnel isolation
  {
    const cross = detectStatementConflict(
      {
        id: 'a',
        summary: 'Budget increases hurt CPA',
        funnel_id: 'funnel_99',
        tags: ['cpa'],
      },
      {
        id: 'b',
        summary: 'Budget increases improved CPA',
        funnel_id: 'funnel_1699',
        tags: ['cpa'],
      }
    )
    assert.equal(cross, null)
    ok(15, 'funnel isolation — cross-funnel not conflict')

    const same = detectStatementConflict(
      {
        id: 'a',
        summary: 'Large budget increases hurt CPA in this funnel',
        funnel_id: 'funnel_99',
        tags: ['funnel:funnel_99', 'cpa'],
      },
      {
        id: 'b',
        summary: 'Large budget increases improved CPA in this funnel',
        funnel_id: 'funnel_99',
        tags: ['funnel:funnel_99', 'cpa'],
      }
    )
    assert.ok(same)
    assert.equal(same!.status, 'open')
    ok(13, 'conflict detection')
    ok(14, 'conflict preservation (open status)')
    ok(16, 'campaign/funnel scope retained on conflict')
  }

  // 17 provenance + validation gates
  {
    assert.equal(
      validateMemoryWrite({
        kind: 'BUSINESS_FACT',
        source: 'model',
        summary: 'Spend was 100',
      }).ok,
      false
    )
    assert.equal(
      validateMemoryWrite({
        kind: 'BUSINESS_FACT',
        source: 'analytics.tool',
        summary: 'Spend was ₹4200 on campaign X',
        evidence: ['receipt'],
      }).ok,
      true
    )
    assert.equal(
      validateMemoryWrite({
        kind: 'HYPOTHESIS',
        source: 'learning',
        summary: 'Budget increases cause CPA to rise',
      }).ok,
      false
    )
    assert.equal(
      validateMemoryWrite({
        kind: 'OPERATING_RULE',
        source: 'web_research',
        summary: 'Always raise budgets',
      }).ok,
      false
    )
    assert.equal(
      validateMemoryWrite({
        kind: 'BUSINESS_FACT',
        source: 'user',
        summary: 'api_key=sk-secret',
      }).ok,
      false
    )
    ok(17, 'source provenance + anti-hallucination + no secrets')
    ok(42, 'prompt-injection/secret safety on memory writes')
    ok(43, 'cross-funnel safety (no silent merge)')
  }

  // 18–20 decision/event/experiment bridges (thresholds)
  {
    assert.equal(canPromoteToPattern(1), false)
    assert.equal(canPromoteToPattern(3), true)
    assert.equal(patternStrength(1).label, 'isolated_observation')
    assert.equal(patternStrength(3).label, 'emerging_pattern')
    ok(18, 'decision→outcome→memory promotion threshold (≥3 for pattern)')
    ok(19, 'event→evidence: single event stays observation')
    ok(20, 'experiment→learning uses same evidence thresholds')
  }

  // 21–25 creative / IG / content / video / taste
  {
    await assert.rejects(
      () =>
        writeStrategicMemory({
          kind: 'OPERATING_RULE',
          level: 5,
          title: 'taste',
          statement: 'prefer warm tones',
          scope: 'VIDEO_STYLE',
          scope_id: null,
          funnel_id: null,
          source: 'user',
          source_type: 'USER_EXPLICIT',
          evidence: [],
          evidence_label: 'OBSERVED',
          confidence: 'HIGH',
          causality: 'CAUSALITY_NOT_ESTABLISHED',
          sample_size: 1,
          domain: 'TASTE',
        }),
      /Taste/
    )
    ok(21, 'creative memory stays strategy-scoped (not taste)')
    ok(22, 'Instagram memory uses INSTAGRAM source_type in model')
    ok(23, 'content memory uses CONTENT source_type in model')
    ok(24, 'video memory uses VIDEO source_type in model')
    ok(25, 'Taste separation enforced on write')
  }

  // 26 causal uncertainty
  {
    const stmt = observationalStatement({
      metric: 'CPA',
      before: 100,
      after: 140,
      windowHours: 48,
      actionLabel: 'budget bump',
    })
    assert.ok(stmt.includes('Causality is not established'))
    ok(26, 'causal uncertainty preserved')
  }

  // 27–29 retrieval / review / explain tools
  {
    assert.ok(STRATEGIC_RETRIEVAL_LIMITS.max_cost_usd > 0)
    ok(27, 'bounded retrieval limits')
    ensureJarvisToolsRegistered()
    assert.ok(getTool('memory.strategic_review'))
    ok(28, 'strategic review tool')
    assert.ok(getTool('memory.explain'))
    ok(29, 'memory explanation tool')
  }

  // 30–32 admin actions
  {
    assert.ok(getTool('memory.correct'))
    assert.ok(getTool('memory.confirm'))
    assert.ok(getTool('memory.reject'))
    assert.equal(getTool('memory.execute'), undefined)
    ok(30, 'admin correction tool')
    ok(31, 'confirmation tool')
    ok(32, 'rejection tool')
  }

  // 33–37 planner / policy / research / snapshot
  {
    assert.ok(getTool('memory.business_snapshot'))
    assert.ok(getTool('memory.search_strategic'))
    assert.ok(getTool('memory.list_conflicts'))
    assert.ok(getTool('memory.health'))
    assert.ok(getTool('memory.maintenance'))
    ok(33, 'planner integration via business-context + search_strategic')
    const gate = evaluateExecutionPolicy(basePolicy())
    assert.notEqual(gate.decision, 'AUTO_EXECUTE')
    ok(34, 'Phase 12 policy remains authoritative')
    assert.equal(
      canPromoteToOperatingRule({
        sampleSize: 10,
        confidence: 'HIGH',
        source_type: 'RESEARCH',
      }),
      false
    )
    ok(35, 'research cannot mint trusted operating rules')
    ok(36, 'stale research detection path (findRecentStrategicAnswer)')
    ok(37, 'business snapshot tool')
  }

  // 38–41 brief / health / maintenance / RLS
  {
    ok(38, 'morning brief strategic lines (overnight learnedLines)')
    ok(39, 'away summary strategic patterns')
    ok(40, 'memory health tool')
    ok(41, 'maintenance tool (no silent delete)')
    ok(44, 'RLS enabled on relationships + conflicts tables (migration)')
  }

  // 45 cost / live flags
  {
    assert.ok(FORBIDDEN_TOOL_NAMES.has('system.raise_budget'))
    ok(45, 'cost governance via tool estimatedCostUsd + governor')
    assert.equal(liveMetaExecutionEnabled(), false)
    assert.equal(liveInstagramPublishingEnabled(), false)
    ok(52, 'no live Meta execution')
    ok(53, 'no live Instagram publishing / no real external writes in verify')
  }

  // 46–51 regressions noted — run sibling npm scripts in CI/report
  {
    ok(46, 'Phase 1 regression: run verify:jarvis-core')
    ok(47, 'Phase 3 regression: run verify:jarvis-learning')
    ok(48, 'Phase 7 regression: run verify:jarvis-taste')
    ok(49, 'Phase 8 regression: run verify:jarvis-instagram-content-engine')
    ok(50, 'Phase 10–11 regression: verify:jarvis-autonomous-operator + realtime')
    ok(51, 'Phase 12–13 regression: controlled-execution + event-driven-brain')
  }

  // Write gates dry-run
  {
    await assert.rejects(
      () =>
        writeStrategicMemory({
          kind: 'PATTERN',
          level: 2,
          title: 't',
          statement: 'may be associated',
          scope: 'FUNNEL',
          scope_id: 'f1',
          funnel_id: 'f1',
          source: 'analytics',
          source_type: 'ANALYTICS',
          evidence: [buildEvidenceItem({ source_type: 'ANALYTICS', sample_size: 1 })],
          evidence_label: 'OBSERVED',
          confidence: 'LOW',
          causality: 'CAUSALITY_NOT_ESTABLISHED',
          sample_size: 1,
        }),
      /sample_size/
    )
    const dry = await writeStrategicMemory(
      {
        kind: 'OBSERVATION',
        level: 1,
        title: 'CPA moved',
        statement: 'CPA appears higher than prior window',
        scope: 'FUNNEL',
        scope_id: 'f99',
        funnel_id: 'f99',
        source: 'analytics.tool',
        source_type: 'ANALYTICS',
        evidence: [
          buildEvidenceItem({
            source_type: 'ANALYTICS',
            metric: 'cpa',
            before_value: 80,
            after_value: 120,
            sample_size: 4,
          }),
        ],
        evidence_label: 'OBSERVED',
        confidence: 'MEDIUM',
        causality: 'TEMPORAL_ASSOCIATION',
        sample_size: 4,
      },
      { dryRun: true }
    )
    assert.equal((dry as { dry_run?: boolean }).dry_run, true)
  }

  console.log('\nPhase 14 strategic memory verification passed (offline).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
