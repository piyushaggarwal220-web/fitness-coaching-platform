/**
 * Phase 15 — Opportunity types (unified business opportunities).
 * Distinct from Instagram niche / video footage opportunity tables.
 */

export type OpportunityType =
  | 'MARKETING_EFFICIENCY'
  | 'FUNNEL'
  | 'CONTENT'
  | 'CREATIVE'
  | 'REVENUE'
  | 'FINANCIAL'
  | 'OPERATIONAL'
  | 'SYSTEM_RISK'
  | 'INTEGRATION_RISK'
  | 'EXPERIMENT'
  | 'CUSTOMER'
  | 'INSTAGRAM'
  | 'SHOPIFY'

export type OpportunityStatus =
  | 'DETECTED'
  | 'SCORED'
  | 'INVESTIGATING'
  | 'VALIDATED'
  | 'PROPOSED'
  | 'APPROVAL_REQUIRED'
  | 'EXECUTING'
  | 'MEASURING'
  | 'LEARNED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'DISMISSED'
  | 'SNOOZED'

export type Band = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ConfidenceBand = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'
export type Freshness = 'FRESH' | 'RECENT' | 'STALE' | 'UNKNOWN'
export type Uncertainty = 'KNOWN' | 'LIKELY' | 'POSSIBLE' | 'UNKNOWN'
export type EvidenceStrength = 'INSUFFICIENT' | 'WEAK' | 'MODERATE' | 'STRONG'

export type OpportunityScoreBreakdown = {
  impact: Band
  confidence: ConfidenceBand
  evidence: EvidenceStrength
  urgency: Band
  actionability: 'LOW' | 'MEDIUM' | 'HIGH'
  freshness: Freshness
  risk: Band
  note: string
}

export type OpportunityRecord = {
  id: string
  fingerprint: string
  type: OpportunityType
  title: string
  summary: string
  status: OpportunityStatus
  priority: Band
  funnel_id: string | null
  system: string
  source_event_ids: string[]
  source_memory_ids: string[]
  source_decision_ids: string[]
  source_measurement_ids: string[]
  evidence: unknown[]
  observed_facts: string[]
  inferences: string[]
  hypotheses: string[]
  recommendations: string[]
  confidence: ConfidenceBand
  evidence_strength: EvidenceStrength
  freshness: Freshness
  uncertainty: Uncertainty
  expected_impact: string | null
  impact_range: Record<string, unknown>
  impact_currency: string
  impact_horizon: string | null
  actionability: 'LOW' | 'MEDIUM' | 'HIGH'
  urgency: Band
  opportunity_cost: string | null
  score_breakdown: OpportunityScoreBreakdown
  goal_id: string | null
  plan_id: string | null
  snooze_until: string | null
  expires_at: string | null
  last_validated_at: string | null
  created_at: string
  updated_at: string
}

export type ScenarioKind = 'BASELINE' | 'UPSIDE' | 'DOWNSIDE'

export type ScenarioResult = {
  kind: ScenarioKind
  label: 'SCENARIO'
  assumptions: string[]
  inputs: Record<string, number | null>
  outputs: Record<string, number | null>
  note: string
}
