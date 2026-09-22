/**
 * Rollback metadata — does not silently execute rollbacks.
 */

import type { ActionClass, Reversibility } from '@/lib/jarvis/execution/policy/types'
import { classifyToolAction } from '@/lib/jarvis/execution/policy/classify'

export type RollbackPlan = {
  reversibility: Reversibility
  can_rollback: boolean
  rollback_tool: string | null
  rollback_input: Record<string, unknown> | null
  note: string
}

export function buildRollbackPlan(input: {
  toolName: string
  actionClass?: ActionClass
  beforeState: Record<string, unknown>
  toolInput: Record<string, unknown>
}): RollbackPlan {
  const classified = classifyToolAction(input.toolName)
  const actionClass = input.actionClass || classified.action_class
  const rev = classified.reversibility

  if (actionClass === 'AD_BUDGET_INCREASE' || actionClass === 'AD_BUDGET_DECREASE') {
    const prev = input.beforeState.daily_budget ?? input.beforeState.budget
    if (prev != null) {
      return {
        reversibility: 'REVERSIBLE',
        can_rollback: true,
        rollback_tool: input.toolName.includes('increase')
          ? 'meta.decrease_budget'
          : 'meta.increase_budget',
        rollback_input: {
          ...input.toolInput,
          restore_budget: prev,
          note: 'Restore previous budget — still requires policy/approval.',
        },
        note: 'Budget change can restore prior daily budget if provider supports it. Rollback itself must pass policy.',
      }
    }
  }

  if (actionClass === 'AD_PAUSE') {
    return {
      reversibility: 'REVERSIBLE',
      can_rollback: true,
      rollback_tool: 'meta.resume_ad',
      rollback_input: { ...input.toolInput },
      note: 'Pause may be reversed by resume when LIVE_META_EXECUTION_ENABLED and approved.',
    }
  }

  if (actionClass === 'SHOPIFY_PRICE_UPDATE' || actionClass === 'SHOPIFY_STATUS_UPDATE') {
    return {
      reversibility: 'REVERSIBLE',
      can_rollback: Boolean(input.beforeState.price || input.beforeState.status),
      rollback_tool: input.toolName,
      rollback_input: { ...input.toolInput, restore: input.beforeState },
      note: 'Shopify field restore uses previous snapshot; still policy-gated.',
    }
  }

  if (actionClass === 'CONTENT_PUBLISH') {
    return {
      reversibility: 'NOT_REVERSIBLE',
      can_rollback: false,
      rollback_tool: null,
      rollback_input: null,
      note: 'Instagram publish is not auto-deleted. Manual review required.',
    }
  }

  if (actionClass === 'VIDEO_RENDER') {
    return {
      reversibility: 'PARTIALLY_REVERSIBLE',
      can_rollback: true,
      rollback_tool: null,
      rollback_input: null,
      note: 'Render may be cancellable only while provider status is still queued/running.',
    }
  }

  return {
    reversibility: rev,
    can_rollback: rev === 'REVERSIBLE',
    rollback_tool: null,
    rollback_input: null,
    note:
      rev === 'NOT_REVERSIBLE'
        ? 'This action is not automatically reversible.'
        : 'Rollback metadata recorded; execute only through policy + audit.',
  }
}
