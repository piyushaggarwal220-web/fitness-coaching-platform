/**
 * Structured execution policy — LLM proposes; this decides.
 */

import {
  ALWAYS_APPROVAL_CLASSES,
  ALWAYS_BLOCKED_CLASSES,
  GUARDED_AUTO_CLASSES,
  classifyToolAction,
  systemForTool,
} from '@/lib/jarvis/execution/policy/classify'
import type { PolicyFacts, PolicyResult } from '@/lib/jarvis/execution/policy/types'

export function evaluateExecutionPolicy(facts: PolicyFacts): PolicyResult {
  const classified = classifyToolAction(facts.tool_name)
  const action_class = facts.action_class || classified.action_class
  const system = facts.system || systemForTool(facts.tool_name)
  const require_verification = classified.require_verification

  const base = {
    action_class,
    system,
    require_verification,
    require_receipt: true as const,
  }

  if (ALWAYS_BLOCKED_CLASSES.has(action_class)) {
    return {
      ...base,
      decision: 'BLOCKED',
      code: 'FORBIDDEN',
      reason: `${action_class} is permanently blocked. Jarvis cannot change payments, credentials, or its own safety settings.`,
    }
  }

  if (facts.execution_kill_switch) {
    const readSafe =
      ['READ', 'ANALYZE', 'RESEARCH'].includes(action_class) || facts.risk_class === 'READ'
    if (!readSafe) {
      return {
        ...base,
        decision: 'BLOCKED',
        code: 'KILL_SWITCH',
        reason: 'Kill switch is active. External writes are stopped. Reads may continue.',
      }
    }
  }

  // Autonomy Level 0 — before any soft approval / environment prepare paths
  if (facts.autonomy_level <= 0) {
    if (!['READ', 'ANALYZE'].includes(action_class) && facts.risk_class !== 'READ') {
      return {
        ...base,
        decision: 'BLOCKED',
        code: 'AUTONOMY_LEVEL',
        reason: 'Autonomy Level 0 (DISABLED) — no autonomous or write actions.',
      }
    }
  }

  if (facts.already_succeeded) {
    return {
      ...base,
      decision: 'BLOCKED',
      code: 'ALREADY_DONE',
      reason: 'Identical action already succeeded (idempotency). Returning existing receipt.',
    }
  }

  if (facts.duplicate_running) {
    return {
      ...base,
      decision: 'BLOCKED',
      code: 'DUPLICATE',
      reason: 'Identical action is already running. Waiting for lock/receipt.',
    }
  }

  // Environment flags — never override disabled env
  if (system === 'META' && ALWAYS_APPROVAL_CLASSES.has(action_class) && !facts.live_meta_enabled) {
    if (['AD_BUDGET_INCREASE', 'AD_BUDGET_DECREASE', 'AD_ENABLE', 'AD_CREATE'].includes(action_class)) {
      return {
        ...base,
        decision: facts.approved_execution ? 'PREPARE_ONLY' : 'APPROVAL_REQUIRED',
        code: 'ENVIRONMENT_FLAG',
        reason:
          'LIVE_META_EXECUTION_ENABLED=false — ACTIVE Meta spend/activation cannot execute live. Approval records intent only.',
      }
    }
  }

  if (
    (action_class === 'CONTENT_PUBLISH' || system === 'INSTAGRAM') &&
    action_class === 'CONTENT_PUBLISH' &&
    !facts.live_instagram_publishing
  ) {
    return {
      ...base,
      decision: facts.approved_execution ? 'PREPARE_ONLY' : 'APPROVAL_REQUIRED',
      code: 'ENVIRONMENT_FLAG',
      reason:
        'LIVE_INSTAGRAM_PUBLISHING_ENABLED=false — live publish blocked. Approval prepares intent only.',
    }
  }

  if (system === 'SHOPIFY' && !facts.shopify_writes_enabled && action_class !== 'READ' && action_class !== 'ANALYZE') {
    return {
      ...base,
      decision: 'BLOCKED',
      code: 'ENVIRONMENT_FLAG',
      reason: 'Shopify writes are disabled by configuration.',
    }
  }

  if (action_class === 'VIDEO_PUBLISH' && !facts.video_publish_enabled) {
    return {
      ...base,
      decision: 'BLOCKED',
      code: 'ENVIRONMENT_FLAG',
      reason: 'Video publishing is not enabled.',
    }
  }

  if (facts.shadow_mode && !['READ', 'ANALYZE', 'RESEARCH'].includes(action_class)) {
    return {
      ...base,
      decision: 'PREPARE_ONLY',
      code: 'SHADOW',
      reason: 'Shadow mode — action would be evaluated but will not execute.',
    }
  }

  if (facts.dry_run && !['READ', 'ANALYZE', 'RESEARCH'].includes(action_class)) {
    return {
      ...base,
      decision: 'PREPARE_ONLY',
      code: 'DRY_RUN',
      reason: 'Dry-run — full pipeline without external write.',
    }
  }

  if (facts.autonomy_level === 1) {
    if (
      !['READ', 'ANALYZE', 'RESEARCH', 'GENERATE', 'PREPARE'].includes(action_class) &&
      facts.risk_class !== 'READ' &&
      facts.risk_class !== 'LOW_RISK'
    ) {
      return {
        ...base,
        decision: 'PREPARE_ONLY',
        code: 'AUTONOMY_LEVEL',
        reason: 'Autonomy Level 1 — recommendations only. No external writes.',
      }
    }
    if (ALWAYS_APPROVAL_CLASSES.has(action_class) || facts.risk_class === 'SIGNIFICANT') {
      return {
        ...base,
        decision: 'PREPARE_ONLY',
        code: 'AUTONOMY_LEVEL',
        reason: 'Autonomy Level 1 — significant actions are prepare/recommend only.',
      }
    }
  }

  // Always-approval classes (Meta money, publish, etc.)
  if (ALWAYS_APPROVAL_CLASSES.has(action_class) && !facts.approved_execution) {
    return {
      ...base,
      decision: 'APPROVAL_REQUIRED',
      code: 'ACTION_CLASS',
      reason: `${action_class} always requires explicit owner approval (even at Level 4).`,
    }
  }

  if (facts.risk_class === 'SIGNIFICANT' && !facts.approved_execution) {
    // Level 3–4 still require approval for SIGNIFICANT by default
    return {
      ...base,
      decision: 'APPROVAL_REQUIRED',
      code: 'RISK_CLASS',
      reason: 'SIGNIFICANT actions require explicit owner approval before execution.',
    }
  }

  if (facts.risk_class === 'DANGEROUS') {
    return {
      ...base,
      decision: 'BLOCKED',
      code: 'RISK_CLASS',
      reason: 'DANGEROUS actions are blocked.',
    }
  }

  // Cost / rate — soft check at policy (hard reservation later)
  if (
    facts.estimated_cost_usd > 0 &&
    facts.autonomy_level >= 3 &&
    GUARDED_AUTO_CLASSES.has(action_class) &&
    facts.estimated_cost_usd > 50
  ) {
    return {
      ...base,
      decision: 'BLOCKED',
      code: 'BUDGET',
      reason: 'Estimated cost exceeds hard auto-action sanity cap.',
    }
  }

  // Level 2: prepare + approval for writes
  if (facts.autonomy_level === 2 && !facts.approved_execution) {
    // Architecture: registry riskClass READ always AUTO_EXECUTE at Level 2,
    // even if legacy action_class is UNKNOWN. Writes already gated above via
    // ALWAYS_APPROVAL_CLASSES / SIGNIFICANT risk_class.
    if (facts.risk_class === 'READ' && !ALWAYS_APPROVAL_CLASSES.has(action_class)) {
      return {
        ...base,
        decision: 'AUTO_EXECUTE',
        code: 'OK',
        reason: 'Level 2 — registry READ tools execute automatically; no approval.',
      }
    }
    // LOW_RISK follows existing Level 2 policy (auto when not an always-approval write class).
    if (facts.risk_class === 'LOW_RISK' && !ALWAYS_APPROVAL_CLASSES.has(action_class)) {
      return {
        ...base,
        decision: 'AUTO_EXECUTE',
        code: 'OK',
        reason: 'Level 2 — LOW_RISK tools execute automatically; significant stays approval-gated.',
      }
    }
    if (GUARDED_AUTO_CLASSES.has(action_class) && (facts.risk_class === 'READ' || facts.risk_class === 'LOW_RISK')) {
      return {
        ...base,
        decision: 'AUTO_EXECUTE',
        code: 'OK',
        reason: 'Level 2 — low-risk / read actions may execute; significant stays approval-gated.',
      }
    }
    if (!['READ', 'ANALYZE', 'RESEARCH', 'GENERATE', 'PREPARE'].includes(action_class)) {
      return {
        ...base,
        decision: 'APPROVAL_REQUIRED',
        code: 'AUTONOMY_LEVEL',
        reason: 'Autonomy Level 2 — writes require approval.',
      }
    }
  }

  // Level 3–4 guarded auto for allowlisted classes only
  if (facts.autonomy_level >= 3 && GUARDED_AUTO_CLASSES.has(action_class)) {
    if (facts.source === 'cron' && facts.risk_class === 'SIGNIFICANT' && !facts.approved_execution) {
      return {
        ...base,
        decision: 'APPROVAL_REQUIRED',
        code: 'AUTONOMY_LEVEL',
        reason: 'Background SIGNIFICANT still requires approval.',
      }
    }
    return {
      ...base,
      decision: 'AUTO_EXECUTE',
      code: 'OK',
      reason: `Autonomy Level ${facts.autonomy_level} — ${action_class} permitted within hard limits.`,
    }
  }

  if (facts.approved_execution) {
    return {
      ...base,
      decision: 'AUTO_EXECUTE',
      code: 'OK',
      reason: 'Human approval granted — executing within remaining policy and environment gates.',
    }
  }

  if (facts.risk_class === 'READ' || facts.risk_class === 'LOW_RISK') {
    return {
      ...base,
      decision: 'AUTO_EXECUTE',
      code: 'OK',
      reason: `${facts.risk_class} tools execute when authorized.`,
    }
  }

  return {
    ...base,
    decision: 'APPROVAL_REQUIRED',
    code: 'BLOCKED_DEFAULT',
    reason: 'Default: approval required.',
  }
}
