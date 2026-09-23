/**
 * Phase 12 — Controlled Autonomous Execution verification (offline, no paid APIs).
 * Run: npm run verify:jarvis-controlled-execution
 */
import assert from 'node:assert/strict'
import { evaluateExecutionPolicy } from '../src/lib/jarvis/execution/policy/evaluate'
import {
  classifyToolAction,
  systemForTool,
  ALWAYS_BLOCKED_CLASSES,
  ALWAYS_APPROVAL_CLASSES,
} from '../src/lib/jarvis/execution/policy/classify'
import {
  buildIdempotencyKey,
  fingerprintToolInput,
} from '../src/lib/jarvis/execution/idempotency'
import { classifyError, shouldRetry } from '../src/lib/jarvis/execution/retry'
import { buildRollbackPlan } from '../src/lib/jarvis/execution/rollback'
import {
  createExecutionReceipt,
  findReceiptByIdempotency,
  updateExecutionReceipt,
} from '../src/lib/jarvis/execution/receipts'
import { acquireExecutionLock, releaseExecutionLock } from '../src/lib/jarvis/execution/locks'
import {
  reserveExecutionCapacity,
  reconcileReservation,
} from '../src/lib/jarvis/execution/reservations'
import { DEFAULT_EXECUTION_LIMITS, executionKillSwitchActive } from '../src/lib/jarvis/execution/policy/config'
import { executionIncidentFingerprint } from '../src/lib/jarvis/execution/incidents'
import { liveMetaExecutionEnabled } from '../src/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '../src/lib/jarvis/instagram'
import { FORBIDDEN_TOOL_NAMES } from '../src/lib/jarvis/tools/registry'
import { PROTECTED_JARVIS_SETTING_KEYS } from '../src/lib/jarvis/cost/governor'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import { getTool } from '../src/lib/jarvis/tools/registry'
import type { PolicyFacts } from '../src/lib/jarvis/execution/policy/types'

function ok(label: string) {
  console.log(`✓ ${label}`)
}

function baseFacts(overrides: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    tool_name: 'analytics.today_overview',
    action_class: 'READ',
    system: 'OTHER',
    risk_class: 'READ',
    risk_level: 'low',
    estimated_cost_usd: 0.01,
    money_impact_usd: null,
    percent_change: null,
    autonomy_level: 2,
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
  // 1–5 autonomy / decisions
  {
    const r0 = evaluateExecutionPolicy(baseFacts({
      autonomy_level: 0,
      tool_name: 'meta.increase_budget',
      action_class: 'AD_BUDGET_INCREASE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
    }))
    assert.equal(r0.decision, 'BLOCKED')
    ok('Level 0 blocks significant writes')
  }

  {
    const r1 = evaluateExecutionPolicy(baseFacts({
      autonomy_level: 1,
      tool_name: 'meta.increase_budget',
      action_class: 'AD_BUDGET_INCREASE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
    }))
    assert.ok(r1.decision === 'PREPARE_ONLY' || r1.decision === 'APPROVAL_REQUIRED')
    assert.notEqual(r1.decision, 'AUTO_EXECUTE')
    ok('Level 1 does not auto-execute significant writes')
  }

  {
    const r2 = evaluateExecutionPolicy(baseFacts({
      autonomy_level: 2,
      tool_name: 'meta.increase_budget',
      action_class: 'AD_BUDGET_INCREASE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
    }))
    assert.equal(r2.decision, 'APPROVAL_REQUIRED')
    ok('Level 2 requires approval for budget increase')
  }

  {
    const r3 = evaluateExecutionPolicy(baseFacts({
      autonomy_level: 3,
      tool_name: 'creative.generate_hooks',
      action_class: 'GENERATE',
      risk_class: 'LOW_RISK',
      system: 'CONTENT',
    }))
    assert.equal(r3.decision, 'AUTO_EXECUTE')
    ok('Level 3 allows guarded GENERATE')
  }

  {
    const r4 = evaluateExecutionPolicy(baseFacts({
      autonomy_level: 4,
      tool_name: 'meta.increase_budget',
      action_class: 'AD_BUDGET_INCREASE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
    }))
    assert.equal(r4.decision, 'APPROVAL_REQUIRED')
    ok('Level 4 still requires approval for budget increase')
  }

  // 6 blocked classes
  {
    assert.ok(ALWAYS_BLOCKED_CLASSES.has('PAYMENT_CONFIGURATION'))
    const r = evaluateExecutionPolicy(baseFacts({
      tool_name: 'shopify.change_payment_settings',
      action_class: 'PAYMENT_CONFIGURATION',
      risk_class: 'DANGEROUS',
      system: 'SHOPIFY',
    }))
    assert.equal(r.decision, 'BLOCKED')
    ok('Payment configuration blocked')
  }

  // 7–8 env + kill switch
  {
    const r = evaluateExecutionPolicy(baseFacts({
      tool_name: 'meta.increase_budget',
      action_class: 'AD_BUDGET_INCREASE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
      live_meta_enabled: false,
      approved_execution: true,
    }))
    assert.ok(r.decision === 'PREPARE_ONLY' || r.code === 'ENVIRONMENT_FLAG')
    ok('Live Meta false → prepare-only even after approval intent')
  }

  {
    const r = evaluateExecutionPolicy(baseFacts({
      execution_kill_switch: true,
      tool_name: 'meta.pause_ad',
      action_class: 'AD_PAUSE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
    }))
    assert.equal(r.decision, 'BLOCKED')
    assert.equal(r.code, 'KILL_SWITCH')
    ok('Kill switch blocks writes')
  }

  {
    const r = evaluateExecutionPolicy(baseFacts({
      execution_kill_switch: true,
      tool_name: 'analytics.today_overview',
      action_class: 'READ',
      risk_class: 'READ',
    }))
    assert.equal(r.decision, 'AUTO_EXECUTE')
    ok('Kill switch still allows reads')
  }

  // 9–12 budget caps via reservation
  {
    const over = await reserveExecutionCapacity({
      estimatedCostUsd: DEFAULT_EXECUTION_LIMITS.max_auto_action_cost_usd + 1,
      limits: DEFAULT_EXECUTION_LIMITS,
      toolName: 'video.render',
      system: 'VIDEO',
    })
    assert.equal(over.ok, false)
    ok('Per-action cost cap blocks reservation')
  }

  {
    const okRes = await reserveExecutionCapacity({
      estimatedCostUsd: 0.01,
      limits: DEFAULT_EXECUTION_LIMITS,
      toolName: 'creative.generate_hooks',
      system: 'CONTENT',
    })
    assert.equal(okRes.ok, true)
    if (okRes.ok) {
      await reconcileReservation({
        reservationId: okRes.reservationId,
        actualCostUsd: 0.01,
        consume: true,
      })
    }
    ok('Reservation + reconcile works')
  }

  // 13–14 idempotency + locks
  {
    const key = buildIdempotencyKey({
      system: 'META',
      action_class: 'AD_PAUSE',
      tool_name: 'meta.pause_ad',
      target_id: 'adset_1',
      input_fingerprint: fingerprintToolInput({ adset_id: 'adset_1' }),
    })
    const r1 = await createExecutionReceipt({
      toolName: 'meta.pause_ad',
      system: 'META',
      actionClass: 'AD_PAUSE',
      idempotencyKey: key,
      status: 'executed',
    })
    await updateExecutionReceipt(r1.id, { status: 'verified', completed_at: new Date().toISOString() })
    const found = await findReceiptByIdempotency(key)
    assert.ok(found)
    assert.equal(found!.status, 'verified')
    ok('Idempotency finds successful receipt')
  }

  {
    const lockKey = `test-lock-${Date.now()}`
    const a = await acquireExecutionLock({ lockKey, owner: 'worker-a', ttlSeconds: 30 })
    assert.equal(a.ok, true)
    const b = await acquireExecutionLock({ lockKey, owner: 'worker-b', ttlSeconds: 30 })
    assert.equal(b.ok, false)
    await releaseExecutionLock(lockKey, 'worker-a')
    const c = await acquireExecutionLock({ lockKey, owner: 'worker-b', ttlSeconds: 30 })
    assert.equal(c.ok, true)
    await releaseExecutionLock(lockKey, 'worker-b')
    ok('Locks prevent concurrent duplicate owners')
  }

  // 15–16 dry run / shadow
  {
    const dry = evaluateExecutionPolicy(baseFacts({
      dry_run: true,
      tool_name: 'meta.pause_ad',
      action_class: 'AD_PAUSE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
    }))
    assert.equal(dry.decision, 'PREPARE_ONLY')
    assert.equal(dry.code, 'DRY_RUN')
    const shadow = evaluateExecutionPolicy(baseFacts({
      shadow_mode: true,
      tool_name: 'meta.pause_ad',
      action_class: 'AD_PAUSE',
      risk_class: 'SIGNIFICANT',
      system: 'META',
    }))
    assert.equal(shadow.decision, 'PREPARE_ONLY')
    assert.equal(shadow.code, 'SHADOW')
    ok('Dry-run and shadow never auto-execute writes')
  }

  // 17–18 approval classes + fingerprint change
  {
    assert.ok(ALWAYS_APPROVAL_CLASSES.has('CONTENT_PUBLISH'))
    const fp1 = fingerprintToolInput({ budget: 1000 })
    const fp2 = fingerprintToolInput({ budget: 1200 })
    assert.notEqual(fp1, fp2)
    ok('Changed action fingerprint invalidates reuse')
  }

  // 19 verification failure status on receipt
  {
    const key = buildIdempotencyKey({
      system: 'META',
      action_class: 'AD_PAUSE',
      tool_name: 'meta.pause_ad',
      target_id: 'adset_v',
      input_fingerprint: 'v1',
    })
    const r = await createExecutionReceipt({
      toolName: 'meta.pause_ad',
      system: 'META',
      actionClass: 'AD_PAUSE',
      idempotencyKey: key,
      status: 'executing',
    })
    const updated = await updateExecutionReceipt(r.id, {
      status: 'verification_failed',
      verification_status: 'FAILED',
      verification_summary: 'Provider state mismatch',
    })
    assert.equal(updated?.status, 'verification_failed')
    ok('Verification failure is not success on receipt')
  }

  // 20–21 retry
  {
    assert.equal(classifyError(new Error('429 rate limit')), 'RATE_LIMIT')
    assert.equal(classifyError(new Error('invalid input')), 'VALIDATION')
    assert.equal(shouldRetry('TRANSIENT', 0), true)
    assert.equal(shouldRetry('VALIDATION', 0), false)
    assert.equal(shouldRetry('TRANSIENT', 3), false)
    ok('Retry classification + hard cap')
  }

  // 22 rollback metadata
  {
    const plan = buildRollbackPlan({
      toolName: 'meta.increase_budget',
      beforeState: { daily_budget: 1000 },
      toolInput: { adset_id: 'x' },
    })
    assert.equal(plan.reversibility, 'REVERSIBLE')
    assert.equal(plan.can_rollback, true)
    const ig = buildRollbackPlan({
      toolName: 'instagram.publish',
      beforeState: {},
      toolInput: {},
    })
    assert.equal(ig.reversibility, 'NOT_REVERSIBLE')
    ok('Rollback metadata for budget vs Instagram publish')
  }

  // 23–24 incident fingerprint dedupe key
  {
    const a = executionIncidentFingerprint({
      system: 'META',
      toolName: 'meta.pause_ad',
      targetId: '1',
      errorClass: 'PROVIDER',
    })
    const b = executionIncidentFingerprint({
      system: 'META',
      toolName: 'meta.pause_ad',
      targetId: '1',
      errorClass: 'PROVIDER',
    })
    assert.equal(a, b)
    ok('Incident fingerprint stable for dedupe')
  }

  // 25–26 receipt create
  {
    const r = await createExecutionReceipt({
      toolName: 'analytics.today_overview',
      system: 'OTHER',
      actionClass: 'READ',
      idempotencyKey: `read-${Date.now()}`,
      status: 'executed',
      beforeState: { api_key: 'sk-should-redact', spend: 1 },
    })
    assert.equal(r.before_state.api_key, '[redacted]')
    assert.equal(r.before_state.spend, 1)
    ok('Receipt created; secrets redacted from before_state')
  }

  // 29–30 protected settings
  {
    assert.ok(PROTECTED_JARVIS_SETTING_KEYS.has('execution_kill_switch'))
    assert.ok(PROTECTED_JARVIS_SETTING_KEYS.has('max_auto_action_cost_usd'))
    ok('Kill switch + limits are protected settings')
  }

  // 31–33 live flags / shopify payment / forbidden
  {
    assert.equal(liveMetaExecutionEnabled(), false)
    assert.equal(liveInstagramPublishingEnabled(), false)
    assert.ok(FORBIDDEN_TOOL_NAMES.has('shopify.change_payment_settings'))
    assert.ok(FORBIDDEN_TOOL_NAMES.has('system.raise_budget'))
    ok('Live flags off; payment + self-privilege tools forbidden')
  }

  // 34 classify tools
  {
    ensureJarvisToolsRegistered()
    assert.equal(classifyToolAction('meta.increase_budget').action_class, 'AD_BUDGET_INCREASE')
    assert.equal(systemForTool('instagram.publish'), 'INSTAGRAM')
    assert.equal(getTool('lurvox.revenue')?.riskClass, 'READ')
    assert.equal(classifyToolAction('lurvox.revenue').action_class, 'READ')
    // Future lurvox.* must not inherit READ from prefix alone when unregistered.
    assert.equal(classifyToolAction('lurvox.hypothetical_write').action_class, 'UNKNOWN')
    assert.equal(classifyToolAction('instagram.get_profile').action_class, 'READ')
    assert.equal(classifyToolAction('instagram.content_performance').action_class, 'READ')
    assert.equal(classifyToolAction('instagram.prepare_publish').action_class, 'PREPARE')
    assert.equal(classifyToolAction('instagram.publish').action_class, 'CONTENT_PUBLISH')
    assert.equal(classifyToolAction('memory.remember').action_class, 'GENERATE')
    assert.equal(ALWAYS_APPROVAL_CLASSES.has('CONTENT_PUBLISH'), true)
    assert.equal(ALWAYS_APPROVAL_CLASSES.has('AD_BUDGET_INCREASE'), true)
    ok('Action classification maps tools to classes/systems')
  }

  // READ registry tools must not require approval at autonomy level 2
  {
    const classified = classifyToolAction('lurvox.revenue')
    const decision = evaluateExecutionPolicy({
      ...baseFacts({
        tool_name: 'lurvox.revenue',
        action_class: classified.action_class,
        system: systemForTool('lurvox.revenue'),
        risk_class: 'READ',
        autonomy_level: 2,
      }),
    })
    assert.equal(decision.decision, 'AUTO_EXECUTE')

    // Safety net: even UNKNOWN action_class + registry READ risk must auto-execute at L2.
    const unknownButRead = evaluateExecutionPolicy({
      ...baseFacts({
        tool_name: 'lurvox.revenue',
        action_class: 'UNKNOWN',
        system: 'OTHER',
        risk_class: 'READ',
        autonomy_level: 2,
      }),
    })
    assert.equal(unknownButRead.decision, 'AUTO_EXECUTE')

    // Significant writes still require approval at L2.
    const budget = evaluateExecutionPolicy({
      ...baseFacts({
        tool_name: 'meta.increase_budget',
        action_class: 'AD_BUDGET_INCREASE',
        system: 'META',
        risk_class: 'SIGNIFICANT',
        autonomy_level: 2,
      }),
    })
    assert.equal(budget.decision, 'APPROVAL_REQUIRED')

    const publish = evaluateExecutionPolicy({
      ...baseFacts({
        tool_name: 'instagram.publish',
        action_class: 'CONTENT_PUBLISH',
        system: 'INSTAGRAM',
        risk_class: 'SIGNIFICANT',
        autonomy_level: 2,
        live_instagram_publishing: false,
      }),
    })
    assert.equal(publish.decision, 'APPROVAL_REQUIRED')
    ok('lurvox.revenue READ auto-executes at L2; Meta/IG writes stay approval-gated')
  }

  // Tools registered
  {
    ensureJarvisToolsRegistered()
    assert.ok(getTool('execution.policy_status'))
    assert.ok(getTool('execution.preview'))
    assert.ok(getTool('execution.kill_switch_status'))
    assert.equal(getTool('execution.execute'), undefined)
    ok('Execution status tools registered; no unrestricted execute_anything')
  }

  // Kill switch env helper (unset = not active)
  {
    const prev = process.env.JARVIS_EXECUTION_KILL_SWITCH
    delete process.env.JARVIS_EXECUTION_KILL_SWITCH
    delete process.env.JARVIS_EXECUTION_ENABLED
    assert.equal(executionKillSwitchActive(), false)
    process.env.JARVIS_EXECUTION_KILL_SWITCH = 'true'
    assert.equal(executionKillSwitchActive(), true)
    if (prev === undefined) delete process.env.JARVIS_EXECUTION_KILL_SWITCH
    else process.env.JARVIS_EXECUTION_KILL_SWITCH = prev
    delete process.env.JARVIS_EXECUTION_ENABLED
    ok('Kill switch env semantics')
  }

  console.log('\nPhase 12 controlled execution verification passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
