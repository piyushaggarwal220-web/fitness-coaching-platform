/**
 * Cross-system investigation — targeted, not query-everything.
 * Separates OBSERVED / INFERRED / UNCERTAIN / RECOMMENDATION.
 */

import { matchInvestigationPattern } from '@/lib/jarvis/operator/investigations/patterns'
import { buildDiagnosis, formatDiagnosisExplanation } from '@/lib/jarvis/autonomous/diagnosis'
import type { AttentionItem, DiagnosisLayer } from '@/lib/jarvis/autonomous/types'
import type { UnifiedObservation } from '@/lib/jarvis/autonomous/types'

export type InvestigationResult = {
  pattern_id: string | null
  systems_used: string[]
  diagnosis: DiagnosisLayer
  explanation: string
  next_steps: string[]
  data_confidence: 'low' | 'medium' | 'high'
}

export function planCrossSystemInvestigation(input: {
  attention: AttentionItem
  observation: UnifiedObservation
}): InvestigationResult {
  const title = `${input.attention.title} ${input.attention.observation}`.toLowerCase()
  const pattern = matchInvestigationPattern(title)
  const systems: string[] = []
  const observed: string[] = [...input.attention.evidence]
  const inferred: string[] = []
  const uncertain: string[] = []
  const recommendation: string[] = []

  if (/revenue|sales|lurvox|purchase/.test(title)) {
    systems.push('REVENUE', 'FUNNEL', 'MARKETING')
    observed.push('Revenue anomaly path selected — LURVOX purchases is canonical coaching revenue.')
    uncertain.push('Shopify commerce is separate from LURVOX coaching revenue.')
    uncertain.push('Causal root cause not established from revenue signal alone.')
    recommendation.push('Compare payment ledger windows, then funnel CPA, then Meta — do not assume Meta caused the drop.')
  } else if (/cpa|roas|meta|campaign|ad\b|spend/.test(title)) {
    systems.push('MARKETING', 'FUNNEL')
    observed.push('Marketing/funnel path selected using configured funnel targets where available.')
    recommendation.push('Inspect spend, clicks, CTR, conversions, creative changes — prepare recommendation; significant Meta writes need approval.')
  } else if (/instagram|content|publish|reel/.test(title)) {
    systems.push('INSTAGRAM', 'CONTENT')
    if ((input.observation.instagram as { stale_hours?: number | null }).stale_hours != null &&
      ((input.observation.instagram as { stale_hours: number }).stale_hours >= 48)) {
      observed.push('Instagram metrics are stale — do not conclude performance dropped.')
      uncertain.push('Current Instagram performance cannot be verified until sync completes.')
    }
    recommendation.push('Check content queue blockers and sync health before creative conclusions.')
  } else if (/budget|cost|ai budget/.test(title)) {
    systems.push('COST', 'OPERATIONS')
    recommendation.push('Pause expensive work (PAUSED_BUDGET). Budget increases are human-only.')
  } else {
    systems.push('OPERATIONS', 'SYSTEMS')
    recommendation.push(input.attention.next_action || 'Investigate with diagnostics.')
  }

  if (pattern) {
    systems.push(...pattern.systems_allowed.map((s) => s.toUpperCase()))
    inferred.push(`Matched investigation pattern: ${pattern.id} (${pattern.title}).`)
  } else {
    uncertain.push('No exact investigation pattern match — using heuristic system selection.')
  }

  // Freshness / confidence
  let data_confidence: 'low' | 'medium' | 'high' = 'medium'
  if (input.observation.data_status !== 'verified') data_confidence = 'low'
  if (input.attention.severity === 'CRITICAL' && input.attention.evidence.length >= 2) {
    data_confidence = data_confidence === 'low' ? 'low' : 'high'
  }

  inferred.push(
    'Signals may co-occur without proving causation. Treat creative/campaign timing as hypothesis unless controlled evidence exists.'
  )

  const diagnosis = buildDiagnosis({ observed, inferred, uncertain, recommendation })
  return {
    pattern_id: pattern?.id ?? null,
    systems_used: [...new Set(systems)],
    diagnosis,
    explanation: formatDiagnosisExplanation(diagnosis),
    next_steps: recommendation,
    data_confidence,
  }
}

/**
 * Bounded investigate runner for overnight — may call pattern when budget allows.
 * Does not execute significant Meta writes.
 */
export async function runBoundedInvestigation(input: {
  attention: AttentionItem
  observation: UnifiedObservation
  allowExpensive?: boolean
  actorId?: string | null
}): Promise<InvestigationResult & { ran_pattern: boolean; note: string }> {
  const plan = planCrossSystemInvestigation(input)
  if (!input.allowExpensive || !plan.pattern_id) {
    return {
      ...plan,
      ran_pattern: false,
      note: 'Diagnosis prepared without expensive pattern run (budget/autonomy gate).',
    }
  }

  try {
    const { runInvestigationPattern } = await import(
      '@/lib/jarvis/operator/investigations/patterns'
    )
    await runInvestigationPattern({
      patternId: plan.pattern_id as never,
      question: input.attention.title,
      actorId: input.actorId,
      maxToolCalls: 4,
      maxCostUsd: 0.25,
    })
    return {
      ...plan,
      ran_pattern: true,
      note: `Ran investigation pattern ${plan.pattern_id}. Results require operator review — no significant writes applied automatically.`,
    }
  } catch (err) {
    return {
      ...plan,
      ran_pattern: false,
      note: `Pattern run skipped/failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
