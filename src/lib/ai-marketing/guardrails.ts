import type { GuardrailSettings, MarketingActionType, RiskLevel } from '@/lib/ai-marketing/types'
import { percentChange } from '@/lib/ai-marketing/metrics'
import { isMetaWriteAction, isSpendAction } from '@/lib/ai-marketing/autonomy'

export type GuardrailCheckInput = {
  action: MarketingActionType
  risk: RiskLevel
  settings: GuardrailSettings
  currentBudget?: number | null
  proposedBudget?: number | null
  entitySpend?: number | null
  entityPurchases?: number | null
  accountDailySpend?: number | null
  frequency?: number | null
}

export type GuardrailCheckResult = {
  passed: boolean
  blockedReasons: string[]
  warnings: string[]
  normalizedParameters: Record<string, unknown>
}

/**
 * Hard safety constraints. AI-proposed values cannot bypass these.
 * Documented rules (not arbitrary):
 * - Pause only after MIN_SPEND_BEFORE_PAUSE / MIN_DATA_BEFORE_PAUSE
 * - Winner status needs MIN_PURCHASES_FOR_WINNER (enforced at decision layer)
 * - Budget changes capped by MAX_BUDGET_*_PERCENT
 * - Single action spend capped by MAX_SINGLE_ACTION_SPEND / MAX_SINGLE_TEST_SPEND
 * - Account daily spend cannot exceed MAX_DAILY_ACCOUNT_SPEND after increase
 */
export function runGuardrails(input: GuardrailCheckInput): GuardrailCheckResult {
  const blocked: string[] = []
  const warnings: string[] = []
  const normalized: Record<string, unknown> = {}
  const s = input.settings

  if (input.action === 'PAUSE_AD') {
    const spend = input.entitySpend ?? 0
    if (spend < s.MIN_SPEND_BEFORE_PAUSE || spend < s.MIN_DATA_BEFORE_PAUSE) {
      blocked.push(
        `Insufficient spend to pause (spend=${spend}, min=${Math.max(s.MIN_SPEND_BEFORE_PAUSE, s.MIN_DATA_BEFORE_PAUSE)}).`
      )
    }
  }

  if (input.action === 'INCREASE_BUDGET' || input.action === 'DECREASE_BUDGET') {
    const current = input.currentBudget ?? null
    const proposed = input.proposedBudget ?? null
    if (current === null || proposed === null) {
      blocked.push('Budget change requires current_budget and proposed_budget.')
    } else {
      const pct = percentChange(current, proposed)
      if (pct === null) {
        blocked.push('Cannot compute budget percentage change.')
      } else if (input.action === 'INCREASE_BUDGET' && pct > s.MAX_BUDGET_INCREASE_PERCENT) {
        blocked.push(
          `Budget increase ${pct.toFixed(1)}% exceeds MAX_BUDGET_INCREASE_PERCENT (${s.MAX_BUDGET_INCREASE_PERCENT}%).`
        )
      } else if (input.action === 'DECREASE_BUDGET' && Math.abs(pct) > s.MAX_BUDGET_DECREASE_PERCENT) {
        blocked.push(
          `Budget decrease ${Math.abs(pct).toFixed(1)}% exceeds MAX_BUDGET_DECREASE_PERCENT (${s.MAX_BUDGET_DECREASE_PERCENT}%).`
        )
      } else {
        normalized.percentage_change = pct
        normalized.current_budget = current
        normalized.proposed_budget = proposed
      }

      if (input.action === 'INCREASE_BUDGET') {
        const delta = proposed - current
        if (delta > s.MAX_SINGLE_ACTION_SPEND) {
          blocked.push(
            `Budget increase delta ${delta} exceeds MAX_SINGLE_ACTION_SPEND (${s.MAX_SINGLE_ACTION_SPEND}).`
          )
        }
        const projectedDaily = (input.accountDailySpend ?? 0) + Math.max(0, delta)
        if (projectedDaily > s.MAX_DAILY_ACCOUNT_SPEND) {
          blocked.push(
            `Projected daily spend ${projectedDaily} exceeds MAX_DAILY_ACCOUNT_SPEND (${s.MAX_DAILY_ACCOUNT_SPEND}).`
          )
        }
      }
    }
  }

  if (
    (input.action === 'CREATE_NEW_TEST' || input.action === 'LAUNCH_EXPERIMENT') &&
    (input.proposedBudget ?? 0) > s.MAX_SINGLE_TEST_SPEND
  ) {
    blocked.push(
      `Test budget exceeds MAX_SINGLE_TEST_SPEND (${s.MAX_SINGLE_TEST_SPEND}).`
    )
  }

  if (
    typeof input.frequency === 'number' &&
    input.frequency >= s.CREATIVE_FATIGUE_THRESHOLD
  ) {
    warnings.push(
      `Frequency ${input.frequency} >= CREATIVE_FATIGUE_THRESHOLD (${s.CREATIVE_FATIGUE_THRESHOLD}). Consider creative refresh.`
    )
  }

  if (isSpendAction(input.action) && input.risk === 'critical') {
    blocked.push('Critical-risk spend actions are blocked by guardrails.')
  }

  if (isMetaWriteAction(input.action) && process.env.LIVE_META_EXECUTION_ENABLED !== 'true') {
    warnings.push(
      'LIVE_META_EXECUTION_ENABLED is not true — Meta write will record approval but will not call live Meta API.'
    )
  }

  return {
    passed: blocked.length === 0,
    blockedReasons: blocked,
    warnings,
    normalizedParameters: normalized,
  }
}
