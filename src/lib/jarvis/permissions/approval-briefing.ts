/**
 * Structured approval briefing — never "Should I do it?"
 * Phase 12: explicit WHAT/WHY/TARGET/CHANGE/COST/RISK/ROLLBACK/EXPIRATION.
 */

import type { JarvisApprovalCard, JarvisRiskClass, JarvisRiskLevel } from '@/lib/jarvis/types'
import { buildRollbackPlan } from '@/lib/jarvis/execution/rollback'

export type ApprovalBriefing = {
  what: string
  why: string
  target: string
  expected: string
  risk: string
  cost: string
  reversibility: 'easy' | 'moderate' | 'difficult'
  will_happen: string[]
  will_not_happen: string[]
  rollback_plan: string
  expiration_note: string
  rollback_reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'NOT_REVERSIBLE'
  current: Record<string, unknown>
  proposed: Record<string, unknown>
}

export function buildApprovalBriefing(input: {
  toolName: string
  riskClass: JarvisRiskClass
  riskLevel: JarvisRiskLevel
  reason: string
  toolInput: Record<string, unknown>
  estimatedCostUsd: number
  approvalTtlHours?: number
}): ApprovalBriefing {
  const target =
    String(
      input.toolInput.campaignId ||
        input.toolInput.campaign_id ||
        input.toolInput.adsetId ||
        input.toolInput.ad_set_id ||
        input.toolInput.contentId ||
        input.toolInput.funnelId ||
        input.toolInput.accountId ||
        'unspecified target'
    ).slice(0, 120)

  const rollback = buildRollbackPlan({
    toolName: input.toolName,
    beforeState: {},
    toolInput: input.toolInput,
  })
  const reversibility: ApprovalBriefing['reversibility'] =
    rollback.reversibility === 'REVERSIBLE'
      ? input.riskClass === 'SIGNIFICANT'
        ? 'moderate'
        : 'easy'
      : rollback.reversibility === 'PARTIALLY_REVERSIBLE'
        ? 'moderate'
        : 'difficult'

  const what = describeWhat(input.toolName, input.toolInput)
  const expected =
    typeof input.toolInput.expected_effect === 'string'
      ? input.toolInput.expected_effect
      : `Apply ${input.toolName} as proposed. Measure outcome before further changes.`

  const ttl = input.approvalTtlHours ?? 24

  return {
    what,
    why: input.reason,
    target,
    expected,
    risk: riskCopy(input.riskClass, input.riskLevel, input.toolName),
    cost: `Est. AI/tool cost ~$${input.estimatedCostUsd}${
      input.toolInput.daily_budget != null
        ? `; proposed daily spend related field present in payload`
        : ''
    }`,
    reversibility,
    will_happen: [
      `Run ${input.toolName} through action-runner after approval`,
      'Capture before/after state when provider supports it',
      'Verify write result and record an execution receipt',
    ],
    will_not_happen: [
      'Raise Jarvis autonomy, budgets, or kill-switch settings',
      'Bypass LIVE_META / LIVE_INSTAGRAM / cost governor',
      'Retry blindly without idempotency if the write may have succeeded',
    ],
    rollback_plan: rollback.note || `Reversibility: ${rollback.reversibility}`,
    expiration_note: `Approval expires in ~${ttl}h. Materially changing the action invalidates this approval.`,
    rollback_reversibility: rollback.reversibility,
    current: {},
    proposed: input.toolInput,
  }
}

function describeWhat(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === 'content_ops.publish' || toolName === 'instagram.publish') {
    const contentId = String(toolInput.contentId ?? toolInput.content_id ?? 'content')
    const when = toolInput.scheduled_time || toolInput.scheduled_for || toolInput.dateYmd || 'now'
    const caption = typeof toolInput.caption === 'string' ? toolInput.caption.slice(0, 80) : ''
    return `Publish Reel ${contentId.slice(0, 8)} to Instagram (${when})${caption ? ` — “${caption}…”` : ''}. Platform: Instagram. Account: connected IG Login business account.`
  }
  if (toolName.includes('budget')) {
    const from = toolInput.current_budget ?? toolInput.from ?? null
    const to = toolInput.daily_budget ?? toolInput.budget ?? toolInput.to ?? null
    if (from != null && to != null) {
      return `Change budget from ${String(from)} to ${String(to)} via ${toolName}`
    }
  }
  return `Execute ${toolName} with the proposed parameters`
}

function riskCopy(riskClass: JarvisRiskClass, riskLevel: JarvisRiskLevel, toolName: string): string {
  if (toolName.includes('budget')) {
    return `Higher spend may increase CPA. Risk class ${riskClass} (${riskLevel}).`
  }
  if (toolName.includes('instagram') || toolName.includes('publish')) {
    return `Public content change may be hard to reverse. Risk class ${riskClass} (${riskLevel}).`
  }
  return `Significant external side effect possible. Risk class ${riskClass} (${riskLevel}).`
}

export function enrichmentForApprovalRow(briefing: ApprovalBriefing): {
  actionLabel: string
  evidence: string[]
  currentState: Record<string, unknown>
  proposedState: Record<string, unknown>
  expectedCostNote: string
} {
  return {
    actionLabel: briefing.what,
    evidence: [
      `WHAT: ${briefing.what}`,
      `WHY: ${briefing.why}`,
      `TARGET: ${briefing.target}`,
      `PROPOSED CHANGE: see proposed_state`,
      `ESTIMATED COST: ${briefing.cost}`,
      `RISK: ${briefing.risk}`,
      `REVERSIBILITY: ${briefing.reversibility} (${briefing.rollback_reversibility})`,
      `EXPECTED OUTCOME: ${briefing.expected}`,
      `WHAT WILL HAPPEN: ${briefing.will_happen.join('; ')}`,
      `WHAT WILL NOT HAPPEN: ${briefing.will_not_happen.join('; ')}`,
      `ROLLBACK: ${briefing.rollback_plan}`,
      `EXPIRATION: ${briefing.expiration_note}`,
    ],
    currentState: { ...briefing.current, briefing },
    proposedState: briefing.proposed,
    expectedCostNote: briefing.cost,
  }
}

export function formatApprovalCardForOperator(card: JarvisApprovalCard): string {
  return [
    `Approve: ${card.action_label}`,
    card.reason,
    `Risk: ${card.risk_level} / ${card.risk_class}`,
    card.expected_cost_note ? `Cost: ${card.expected_cost_note}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}
