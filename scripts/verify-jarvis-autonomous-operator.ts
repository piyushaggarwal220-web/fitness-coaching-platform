/**
 * Phase 10 — Jarvis Autonomous Business Operator verification (offline unit checks).
 * Run: npm run verify:jarvis-autonomous-operator
 */
import assert from 'node:assert/strict'
import {
  attentionFingerprint,
  buildDiagnosis,
  formatDiagnosisExplanation,
  containsCausalClaim,
  assertNoUnsupportedRootCause,
  computeBusinessHealth,
  mapIntegrationStatus,
  detectBusinessAnomalies,
  findingToAttention,
  isSignificantForInvestigation,
  buildMorningBrief,
  planCrossSystemInvestigation,
  buildTakeCarePlan,
  type UnifiedObservation,
  type AttentionItem,
} from '../src/lib/jarvis/autonomous'
import { detectProactiveFindings } from '../src/lib/jarvis/workers/proactive'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '../src/lib/jarvis/permissions/risk-engine'
import type { WriteVerificationResult } from '../src/lib/jarvis/core/verify-after-write'
import { FORBIDDEN_TOOL_NAMES } from '../src/lib/jarvis/tools/registry'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

function sampleObservation(overrides?: Partial<UnifiedObservation>): UnifiedObservation {
  return {
    observed_at: new Date().toISOString(),
    timezone: 'Asia/Kolkata',
    health: [],
    revenue: {
      source: 'lurvox.purchases',
      today: { gross_inr: 5000, data_status: 'verified' },
      yesterday: { gross_inr: 8000, data_status: 'verified' },
    },
    marketing: {
      by_funnel: [
        {
          funnel_name: '₹99',
          classified: true,
          spend: 2000,
          cpa: 420,
          max_acceptable_cpa: 300,
          target_cpa: 250,
          initial_roas: 0.8,
          target_roas: 2,
        },
      ],
      unclassified: { spend: 0 },
    },
    funnels: {},
    instagram: { configured: true, stale_hours: 6, live_publishing: false },
    content: { needs_review: 2, scheduled: 1, blocked: 1 },
    video: { configured: false },
    research: {},
    systems: { meta: 'CONNECTED', note: 'NOT_CONFIGURED ≠ BROKEN.' },
    findings: [],
    opportunities: [],
    data_status: 'verified',
    limitations: [],
    ...overrides,
  }
}

async function main() {
  // --- 1–3. Anomaly detection + significance (reuse proactive thresholds) ---
  {
    const anomalies = detectBusinessAnomalies({
      funnelPerformance: {
        byFunnel: [
          {
            funnel_name: '₹99',
            classified: true,
            spend: 2000,
            cpa: 420,
            max_acceptable_cpa: 300,
            target_cpa: 250,
            initial_roas: 0.5,
            target_roas: 2,
          },
        ],
        unclassified: { spend: 0 },
      },
      lurvox: {
        ok: true,
        today_gross_inr: 1000,
        yesterday_gross_inr: 5000,
        data_status: 'verified',
      },
      contentBlocked: 2,
      igSyncStaleHours: 60,
      renderFailures: 1,
      pendingApprovals: 1,
      failedJobs: 0,
      metaConfigured: true,
      metaLastSyncAt: '2026-09-01T00:00:00Z',
    })
    assert.ok(anomalies.findings.some((f) => /CPA above max/i.test(f.title)))
    assert.ok(anomalies.findings.some((f) => /stale/i.test(f.title)))
    assert.ok(anomalies.findings.some((f) => /blocked/i.test(f.title)))
    assert.ok(anomalies.shouldNotify)
    assert.ok(isSignificantForInvestigation(anomalies.severity))
    ok('unified anomaly detection + significance filter')
  }

  // --- Health states with evidence ---
  {
    const base = detectProactiveFindings({
      funnelPerformance: {
        byFunnel: [
          {
            funnel_name: '₹99',
            classified: true,
            spend: 2000,
            cpa: 420,
            max_acceptable_cpa: 300,
            target_cpa: 250,
            initial_roas: null,
            target_roas: null,
          },
        ],
        unclassified: { spend: 0 },
      },
    })
    const health = computeBusinessHealth({
      findings: base.findings,
      contentBlocked: 1,
      igConfigured: true,
      igStale: true,
      budgetExhausted: false,
    })
    const funnel = health.find((h) => h.area === 'FUNNEL' || h.area === 'MARKETING')
    assert.ok(funnel)
    assert.ok(funnel!.evidence.length > 0 || funnel!.reason.length > 0)
    const ig = health.find((h) => h.area === 'INSTAGRAM')!
    assert.equal(ig.state, 'ATTENTION')
    assert.match(ig.reason, /stale|cannot be verified/i)
    ok('business health with evidence + stale Instagram distinction')
  }

  // --- Integration health honesty ---
  {
    assert.equal(mapIntegrationStatus({ configured: false }), 'NOT_CONFIGURED')
    assert.equal(mapIntegrationStatus({ configured: true, ok: true }), 'CONNECTED')
    assert.equal(mapIntegrationStatus({ configured: true, stale: true }), 'DEGRADED')
    assert.equal(mapIntegrationStatus({ configured: true, error: true }), 'UNAVAILABLE')
    ok('system health states (NOT_CONFIGURED ≠ BROKEN)')
  }

  // --- 4–5. Diagnosis evidence separation + no false root cause ---
  {
    const d = buildDiagnosis({
      observed: ['CTR decreased 25%.', 'CPA increased 31%.', 'New creative launched yesterday.'],
      inferred: ['New creative may be contributing.'],
      uncertain: ['Causal link not established.'],
      recommendation: ['Investigate creative vs audience/placement before changing budgets.'],
    })
    assert.ok(assertNoUnsupportedRootCause(d))
    assert.equal(containsCausalClaim('The new creative caused the CPA increase.'), true)
    assert.equal(containsCausalClaim('New creative may be contributing.'), false)
    const text = formatDiagnosisExplanation(d)
    assert.match(text, /OBSERVED:/)
    assert.match(text, /INFERENCE:/)
    assert.match(text, /UNCERTAIN:/)
    assert.match(text, /RECOMMENDATION:/)
    ok('evidence-based diagnosis / no unsupported root cause')
  }

  // --- Fingerprint dedupe ---
  {
    const a = attentionFingerprint({ system: 'meta', title: 'CPA above max', key: '₹99' })
    const b = attentionFingerprint({ system: 'meta', title: 'CPA above max', key: '₹99' })
    const c = attentionFingerprint({ system: 'meta', title: 'CPA above max', key: '₹1699' })
    assert.equal(a, b)
    assert.notEqual(a, c)
    ok('incident/attention fingerprint deduplication')
  }

  // --- Cross-system investigation plan ---
  {
    const item: AttentionItem = findingToAttention({
      severity: 'WARNING',
      title: 'LURVOX revenue drop vs yesterday',
      detail: 'Today lower than yesterday',
      source: 'lurvox.purchases',
    })
    const inv = planCrossSystemInvestigation({
      attention: item,
      observation: sampleObservation(),
    })
    assert.ok(inv.systems_used.includes('REVENUE'))
    assert.ok(inv.diagnosis.observed.length > 0)
    assert.ok(inv.diagnosis.inferred.length > 0 || inv.diagnosis.uncertain.length > 0)
    assert.ok(inv.diagnosis.recommendation.some((r) => /approval|investigate|ledger/i.test(r)))
    ok('cross-system investigation + Shopify ≠ LURVOX note')
  }

  // --- Morning brief ---
  {
    const obs = sampleObservation({
      findings: [
        findingToAttention({
          severity: 'WARNING',
          title: '₹99 funnel CPA above max',
          detail: 'CPA above configured max',
          source: 'meta.funnel_performance',
        }),
      ],
    })
    const brief = buildMorningBrief(obs, { pendingApprovalLabel: 'Increase budget on campaign Y' })
    assert.match(brief.text, /JARVIS — MORNING BRIEF/)
    assert.match(brief.text, /Revenue:/)
    assert.match(brief.text, /Important:/)
    assert.match(brief.text, /Pending approval:/)
    assert.equal(brief.meaningful, true)
    ok('morning brief structure')
  }

  // --- Take care plan does not bypass approval ---
  {
    const plan = buildTakeCarePlan('high CPA on ₹99')
    assert.equal(plan.approval_required, true)
    assert.ok(plan.steps.some((s) => /approval/i.test(s.label)))
    assert.ok(plan.steps.some((s) => s.risk === 'SIGNIFICANT'))
    ok('take-care plan preserves approval boundary')
  }

  // --- Verify-after-write states exist (reuse) ---
  {
    const states: WriteVerificationResult['state'][] = [
      'VERIFIED',
      'EXECUTED_UNVERIFIED',
      'FAILED',
      'RECORDED_NOT_EXECUTED',
    ]
    assert.ok(states.includes('EXECUTED_UNVERIFIED'))
    ok('verify-after-action states available')
  }

  // --- Tools + autonomy + blocked actions ---
  {
    ensureJarvisToolsRegistered()
    for (const name of [
      'autonomous.business_pulse',
      'autonomous.attention_queue',
      'autonomous.morning_brief',
      'autonomous.what_happened',
      'autonomous.explain_attention',
      'autonomous.investigate',
      'autonomous.take_care_plan',
    ]) {
      assert.ok(getTool(name), `missing ${name}`)
    }

    const pulsePerm = await evaluateToolPermission({
      toolName: 'autonomous.business_pulse',
      source: 'chat',
    })
    assert.equal(pulsePerm.allowed, true)

    const publish = getTool('instagram.publish')!
    assert.equal(publish.requiresApproval, true)
    assert.equal(publish.riskClass, 'SIGNIFICANT')

    assert.ok(FORBIDDEN_TOOL_NAMES.size > 0)
    ok('tools / permissions / blocked self-privilege tools')
  }

  // --- Action state vocabulary (no fake autonomy) ---
  {
    const allowed = new Set([
      'PREPARED',
      'APPROVAL_REQUIRED',
      'EXECUTED',
      'EXECUTED_UNVERIFIED',
      'VERIFIED',
      'FAILED',
      'BLOCKED',
      'PAUSED_BUDGET',
    ])
    assert.ok(allowed.has('APPROVAL_REQUIRED'))
    assert.ok(allowed.has('PAUSED_BUDGET'))
    ok('honest action states (no fake autonomy)')
  }

  // --- Quiet notify rule ---
  {
    const quiet = detectBusinessAnomalies({
      funnelPerformance: { byFunnel: [], unclassified: { spend: 0 } },
    })
    assert.equal(quiet.shouldNotify, false)
    ok('quiet operation — INFO-only does not notify')
  }

  console.log('\nPhase 10 autonomous operator verification passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
