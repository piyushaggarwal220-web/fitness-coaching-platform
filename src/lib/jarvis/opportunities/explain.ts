/**
 * Explain / review opportunities with strategic memory context.
 */

import { getOpportunity, listOpportunities } from '@/lib/jarvis/opportunities/store'
import { cpaSpendScenario } from '@/lib/jarvis/opportunities/scoring'
import type { OpportunityRecord } from '@/lib/jarvis/opportunities/types'

export async function explainOpportunity(id: string): Promise<Record<string, unknown>> {
  const opp = await getOpportunity(id)
  if (!opp) return { ok: false, error: 'not_found' }

  let memoryContext: string[] = []
  try {
    const { searchStrategicMemory } = await import('@/lib/jarvis/memory/strategic')
    const pack = await searchStrategicMemory({
      query: opp.title,
      funnelId: opp.funnel_id,
      limit: 5,
    })
    memoryContext = pack.memories.map(
      (m) => `${m.title}: ${m.summary.slice(0, 160)} [${m.memory_status}]`
    )
    if (pack.conflicts.length) {
      memoryContext.push(`Conflicts present: ${pack.conflicts.length} — do not silently pick one.`)
    }
  } catch {
    memoryContext = ['Strategic memory unavailable.']
  }

  return {
    ok: true,
    opportunity: {
      id: opp.id,
      type: opp.type,
      title: opp.title,
      status: opp.status,
      priority: opp.priority,
      funnel_id: opp.funnel_id ?? 'UNCLASSIFIED',
    },
    OBSERVED: opp.observed_facts,
    INFERRED: opp.inferences,
    HYPOTHESIS: opp.hypotheses,
    RECOMMENDATION: opp.recommendations,
    confidence: opp.confidence,
    evidence_strength: opp.evidence_strength,
    freshness: opp.freshness,
    uncertainty: opp.uncertainty,
    score_breakdown: opp.score_breakdown,
    expected_impact: opp.expected_impact,
    HISTORICAL: memoryContext,
    note: 'Causality is not established unless evidence explicitly supports it.',
  }
}

export async function reviewOpportunities(): Promise<Record<string, unknown>> {
  const active = await listOpportunities({
    status: ['DETECTED', 'SCORED', 'INVESTIGATING', 'VALIDATED', 'PROPOSED', 'SNOOZED'],
    limit: 30,
  })
  const buckets = {
    critical: active.filter((o) => o.priority === 'CRITICAL'),
    high: active.filter((o) => o.priority === 'HIGH'),
    watch: active.filter((o) => o.priority === 'MEDIUM' || o.status === 'SNOOZED'),
    investigating: active.filter((o) => o.status === 'INVESTIGATING'),
    validated: active.filter((o) => o.status === 'VALIDATED'),
  }
  const slim = (o: OpportunityRecord) => ({
    id: o.id,
    title: o.title,
    priority: o.priority,
    status: o.status,
    funnel_id: o.funnel_id ?? 'UNCLASSIFIED',
    confidence: o.confidence,
    uncertainty: o.uncertainty,
    next: o.recommendations[0] ?? null,
  })
  return {
    ok: true,
    critical: buckets.critical.map(slim),
    high: buckets.high.map(slim),
    watch: buckets.watch.map(slim),
    investigating: buckets.investigating.map(slim),
    validated: buckets.validated.map(slim),
    note: 'Informational review — no execution. Phase 12 remains authoritative.',
  }
}

export function runOpportunityScenario(input: {
  spend_inr: number | null
  cpa_inr: number | null
  cpa_change_pct: number
}) {
  return cpaSpendScenario(input)
}
