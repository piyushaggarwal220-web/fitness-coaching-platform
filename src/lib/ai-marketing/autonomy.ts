import type { AutonomyLevel, MarketingActionType, RiskLevel } from '@/lib/ai-marketing/types'

const WRITE_ACTIONS: MarketingActionType[] = [
  'PAUSE_AD',
  'RESUME_AD',
  'INCREASE_BUDGET',
  'DECREASE_BUDGET',
  'CREATE_CAMPAIGN',
  'CREATE_ADSET',
  'CREATE_AD',
  'CREATE_CREATIVE',
  'UPDATE_AD',
  'UPDATE_CAMPAIGN',
  'UPDATE_ADSET',
  'LAUNCH_EXPERIMENT',
]

const SPEND_ACTIONS: MarketingActionType[] = [
  'INCREASE_BUDGET',
  'CREATE_CAMPAIGN',
  'CREATE_ADSET',
  'CREATE_AD',
  'LAUNCH_EXPERIMENT',
  'INCREASE_FUNNEL_BUDGET',
  'REALLOCATE_BUDGET_RECOMMENDATION',
]

export function isMetaWriteAction(action: MarketingActionType): boolean {
  return WRITE_ACTIONS.includes(action)
}

export function isSpendAction(action: MarketingActionType): boolean {
  return SPEND_ACTIONS.includes(action)
}

export type AutonomyGateResult =
  | { allowed: true; mode: 'record_only' | 'propose' | 'auto_execute' }
  | { allowed: false; reason: string }

/**
 * Autonomy policy:
 * 0 disabled — nothing
 * 1 recommend only — decisions logged, no actions queued for Meta
 * 2 approval required — actions created as pending (DEFAULT)
 * 3 guarded autonomy — low-risk non-spend auto; spend/high still need approval
 * 4 full autonomy — within guardrails; still never bypasses guardrails
 */
export function evaluateAutonomyGate(input: {
  level: AutonomyLevel
  action: MarketingActionType
  risk: RiskLevel
}): AutonomyGateResult {
  const { level, action, risk } = input

  if (level === 0) {
    return { allowed: false, reason: 'Marketing autonomy is disabled (level 0).' }
  }

  if (level === 1) {
    if (isMetaWriteAction(action) || isSpendAction(action)) {
      return {
        allowed: false,
        reason: 'Level 1 is recommendations only; Meta write/spend actions are blocked.',
      }
    }
    return { allowed: true, mode: 'record_only' }
  }

  if (level === 2) {
    return { allowed: true, mode: 'propose' }
  }

  if (level === 3) {
    if (isSpendAction(action) || risk === 'high' || risk === 'critical') {
      return { allowed: true, mode: 'propose' }
    }
    if (isMetaWriteAction(action) && (risk === 'low' || risk === 'medium')) {
      // Still propose by default until V2 explicitly enables auto Meta writes.
      // Architecture supports auto_execute; V1 keeps Meta writes approval-gated.
      return { allowed: true, mode: 'propose' }
    }
    return { allowed: true, mode: 'propose' }
  }

  // Level 4 — still approval-gated for Meta writes in V1 hard safety.
  // Flag LIVE_META_EXECUTION_ENABLED must be true for auto_execute (checked elsewhere).
  if (isMetaWriteAction(action) && process.env.LIVE_META_EXECUTION_ENABLED !== 'true') {
    return { allowed: true, mode: 'propose' }
  }
  return { allowed: true, mode: 'auto_execute' }
}

export function liveMetaExecutionEnabled(): boolean {
  return process.env.LIVE_META_EXECUTION_ENABLED === 'true'
}
