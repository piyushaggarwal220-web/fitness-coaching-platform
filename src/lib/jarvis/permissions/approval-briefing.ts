/**
 * Structured approval briefing — never "Should I do it?"
 */

import type { JarvisApprovalCard, JarvisRiskClass, JarvisRiskLevel } from '@/lib/jarvis/types'

export type ApprovalBriefing = {
  what: string
  why: string
  target: string
  expected: string
  risk: string
  cost: string
  reversibility: 'easy' | 'moderate' | 'difficult'
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

  const reversibility: ApprovalBriefing['reversibility'] =
    input.riskClass === 'SIGNIFICANT'
      ? input.toolName.includes('budget') || input.toolName.includes('bid')
        ? 'moderate'
        : 'difficult'
      : 'easy'

  const what = describeWhat(input.toolName, input.toolInput)
  const expected =
    typeof input.toolInput.expected_effect === 'string'
      ? input.toolInput.expected_effect
      : `Apply ${input.toolName} as proposed. Measure outcome before further changes.`

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
      `EXPECTED: ${briefing.expected}`,
      `RISK: ${briefing.risk}`,
      `COST: ${briefing.cost}`,
      `REVERSIBILITY: ${briefing.reversibility}`,
    ],
    currentState: { ...briefing.current, briefing },
    proposedState: briefing.proposed,
    expectedCostNote: briefing.cost,
  }
}

export function formatApprovalCardForOperator(card: JarvisApprovalCard): string {
  const evidence = card.evidence || []
  if (evidence.some((e) => e.startsWith('WHAT:'))) {
    return evidence.join('\n')
  }
  return `${card.action_label}\nWhy: ${card.reason}`
}
