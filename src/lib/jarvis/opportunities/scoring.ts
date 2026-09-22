/**
 * Deterministic opportunity scoring — no fake precision.
 */

import type {
  Band,
  ConfidenceBand,
  EvidenceStrength,
  Freshness,
  OpportunityScoreBreakdown,
  Uncertainty,
} from '@/lib/jarvis/opportunities/types'

export function scoreOpportunity(input: {
  impact: Band
  confidence: ConfidenceBand
  evidence_strength: EvidenceStrength
  urgency: Band
  actionability: 'LOW' | 'MEDIUM' | 'HIGH'
  freshness: Freshness
  risk?: Band
}): OpportunityScoreBreakdown {
  return {
    impact: input.impact,
    confidence: input.confidence,
    evidence: input.evidence_strength,
    urgency: input.urgency,
    actionability: input.actionability,
    freshness: input.freshness,
    risk: input.risk ?? 'MEDIUM',
    note: 'Bands only — not a percentage score. Not a prediction.',
  }
}

export function derivePriority(score: OpportunityScoreBreakdown): Band {
  if (score.urgency === 'CRITICAL' || score.impact === 'CRITICAL') return 'CRITICAL'
  if (
    (score.impact === 'HIGH' && score.confidence !== 'VERY_LOW' && score.confidence !== 'LOW') ||
    (score.urgency === 'HIGH' && score.evidence !== 'INSUFFICIENT')
  ) {
    return 'HIGH'
  }
  if (score.impact === 'LOW' && score.urgency === 'LOW') return 'LOW'
  return 'MEDIUM'
}

export function freshnessFromAgeHours(hours: number | null): Freshness {
  if (hours == null || !Number.isFinite(hours)) return 'UNKNOWN'
  if (hours <= 6) return 'FRESH'
  if (hours <= 48) return 'RECENT'
  return 'STALE'
}

export function uncertaintyFromEvidence(
  strength: EvidenceStrength,
  confidence: ConfidenceBand
): Uncertainty {
  if (strength === 'STRONG' && (confidence === 'HIGH' || confidence === 'VERY_HIGH')) return 'KNOWN'
  if (strength === 'MODERATE' || confidence === 'MEDIUM') return 'LIKELY'
  if (strength === 'WEAK') return 'POSSIBLE'
  return 'UNKNOWN'
}

/** CPA scenario — mathematical, not a forecast. */
export function cpaSpendScenario(input: {
  spend_inr: number | null
  cpa_inr: number | null
  cpa_change_pct: number
}): {
  baseline: { purchases: number | null }
  scenario: { purchases: number | null; assumed_cpa: number | null }
  assumptions: string[]
  label: 'SCENARIO'
} {
  const assumptions = [
    'Assumes spend held constant.',
    `Assumes CPA changes by ${input.cpa_change_pct}% (illustrative).`,
    'Does not model auction dynamics, creative fatigue, or seasonality.',
    'SCENARIO — not a forecast certainty.',
  ]
  if (input.spend_inr == null || input.cpa_inr == null || input.cpa_inr <= 0) {
    return {
      baseline: { purchases: null },
      scenario: { purchases: null, assumed_cpa: null },
      assumptions: [...assumptions, 'Spend or CPA UNAVAILABLE — cannot compute.'],
      label: 'SCENARIO',
    }
  }
  const baselinePurchases = input.spend_inr / input.cpa_inr
  const assumedCpa = input.cpa_inr * (1 + input.cpa_change_pct / 100)
  if (assumedCpa <= 0) {
    return {
      baseline: { purchases: baselinePurchases },
      scenario: { purchases: null, assumed_cpa: assumedCpa },
      assumptions: [...assumptions, 'Assumed CPA non-positive — invalid scenario.'],
      label: 'SCENARIO',
    }
  }
  return {
    baseline: { purchases: baselinePurchases },
    scenario: { purchases: input.spend_inr / assumedCpa, assumed_cpa: assumedCpa },
    assumptions,
    label: 'SCENARIO',
  }
}
