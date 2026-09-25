/**
 * Structured approval briefing — never "Should I do it?"
 * Phase 12: explicit WHAT/WHY/TARGET/CHANGE/COST/RISK/ROLLBACK/EXPIRATION.
 */

import type { JarvisApprovalCard, JarvisRiskClass, JarvisRiskLevel } from '@/lib/jarvis/types'
import { buildRollbackPlan } from '@/lib/jarvis/execution/rollback'
import { humanToolLabel, toolFamily } from '@/lib/jarvis/operator-present'

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
      : 'I will only do this one thing, then tell you what happened.'

  const ttl = input.approvalTtlHours ?? 24

  return {
    what,
    why: plainWhy(input.toolName, input.reason),
    target,
    expected,
    risk: riskCopy(input.riskClass, input.riskLevel, input.toolName),
    cost:
      input.estimatedCostUsd > 0
        ? `About $${input.estimatedCostUsd} in AI cost.`
        : 'No extra AI cost.',
    reversibility,
    will_happen: ['I do this only after you tap Approve.'],
    will_not_happen: ['I will not change payments, passwords, or my own safety switches.'],
    rollback_plan: plainRollback(input.toolName, rollback.note),
    expiration_note: `This ask expires in about ${ttl} hours.`,
    rollback_reversibility: rollback.reversibility,
    current: {},
    proposed: input.toolInput,
  }
}

function describeWhat(toolName: string, toolInput: Record<string, unknown>): string {
  const caption = typeof toolInput.caption === 'string' ? toolInput.caption.slice(0, 80) : ''
  if (toolName === 'content_ops.publish' || toolName.includes('instagram.publish') || toolName.includes('publish')) {
    return caption ? `Post this on Instagram: “${caption}”` : 'Post this on Instagram.'
  }
  if (toolName.includes('budget')) {
    const from = toolInput.current_budget ?? toolInput.from ?? null
    const to = toolInput.daily_budget ?? toolInput.budget ?? toolInput.to ?? null
    if (from != null && to != null) {
      return `Change the daily ad budget from ${String(from)} to ${String(to)}.`
    }
    return 'Change an ad budget.'
  }
  if (toolName.includes('pause')) return 'Turn this ad off.'
  if (toolName.includes('enable') || toolName.includes('activate')) return 'Turn this ad back on.'
  if (toolName.includes('price')) return 'Change a Shopify price.'
  if (toolName.includes('diagnostic') || toolName.includes('propose_fix')) return 'Apply a suggested system fix.'
  const label = humanToolLabel(toolName)
  if (label && label !== toolName) return `${label}.`
  return `Do this on ${toolFamily(toolName)}.`
}

function plainWhy(toolName: string, reason: string): string {
  const trimmed = reason.replace(/\s+/g, ' ').trim()
  const policy =
    /significant|approval required|action_class|autonomy level|live_meta|live_instagram|risk class/i.test(trimmed)
  if (!policy && trimmed.length > 0 && trimmed.length <= 140 && !trimmed.includes('_')) return trimmed
  if (toolName.includes('budget')) return 'This changes how much you spend on ads each day.'
  if (toolName.includes('pause')) return 'This stops that ad from running.'
  if (toolName.includes('publish') || toolName.includes('instagram')) return 'People will be able to see this post.'
  if (toolName.includes('price') || toolName.includes('shopify')) return 'This changes your store, not LURVOX checkout.'
  if (toolName.includes('diagnostic') || toolName.includes('propose_fix')) return 'This changes how a system issue is handled.'
  return 'This changes something outside chat. I need your OK first.'
}

function plainRollback(toolName: string, note: string | undefined): string {
  if (toolName.includes('budget') || toolName.includes('pause')) return 'You can change it back later from the same place.'
  if (toolName.includes('publish')) return 'A public post is harder to fully undo.'
  if (note && note.length < 120 && !/reversib/i.test(note)) return note
  return 'Ask me to undo it if you change your mind.'
}

function riskCopy(_riskClass: JarvisRiskClass, riskLevel: JarvisRiskLevel, toolName: string): string {
  const level = riskLevel === 'critical' || riskLevel === 'high' ? 'High' : 'Needs your OK'
  if (toolName.includes('budget')) return `${level}. Spending more can raise what you pay for each sale.`
  if (toolName.includes('publish') || toolName.includes('instagram')) return `${level}. This goes public.`
  if (toolName.includes('pause')) return `${level}. That ad stops getting traffic.`
  return `${level}. This is a real change, not a draft.`
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
    card.action_label,
    card.reason,
    'Tap Approve or Reject.',
  ]
    .filter(Boolean)
    .join('\n')
}
