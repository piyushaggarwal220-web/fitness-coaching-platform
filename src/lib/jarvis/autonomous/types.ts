/**
 * Phase 10 — Autonomous Business Operator types.
 * Action states must stay honest — never fake autonomy.
 */

import type { ProactiveSeverity } from '@/lib/jarvis/workers/proactive'

export type OperatorSeverity = ProactiveSeverity

export type HealthArea =
  | 'REVENUE'
  | 'MARKETING'
  | 'FUNNEL'
  | 'CONTENT'
  | 'INSTAGRAM'
  | 'OPERATIONS'
  | 'SYSTEMS'
  | 'COST'

export type HealthState = 'HEALTHY' | 'ATTENTION' | 'WARNING' | 'CRITICAL' | 'UNKNOWN'

export type IntegrationHealth =
  | 'CONNECTED'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'

export type AutonomousActionState =
  | 'PREPARED'
  | 'APPROVAL_REQUIRED'
  | 'EXECUTED'
  | 'EXECUTED_UNVERIFIED'
  | 'VERIFIED'
  | 'FAILED'
  | 'BLOCKED'
  | 'PAUSED_BUDGET'

export type DiagnosisLayer = {
  observed: string[]
  inferred: string[]
  uncertain: string[]
  recommendation: string[]
}

export type AreaHealth = {
  area: HealthArea
  state: HealthState
  reason: string
  evidence: string[]
  next_action: string | null
  metric?: string | null
  change?: string | null
}

export type AttentionItem = {
  fingerprint: string
  severity: OperatorSeverity
  system: string
  title: string
  observation: string
  evidence: string[]
  next_action: string
  requires_approval: boolean
  deadline_at?: string | null
  status: 'open' | 'investigating' | 'awaiting_approval' | 'resolved' | 'snoozed' | 'dismissed'
  occurrence_count?: number
  diagnosis?: DiagnosisLayer
}

export type OpportunityItem = {
  fingerprint: string
  title: string
  observed: string[]
  inference: string[]
  recommendation: string[]
  system: string
  confidence: 'low' | 'medium' | 'high'
}

export type UnifiedObservation = {
  observed_at: string
  timezone: string
  health: AreaHealth[]
  revenue: Record<string, unknown>
  marketing: Record<string, unknown>
  funnels: Record<string, unknown>
  instagram: Record<string, unknown>
  content: Record<string, unknown>
  video: Record<string, unknown>
  research: Record<string, unknown>
  systems: Record<string, unknown>
  findings: AttentionItem[]
  opportunities: OpportunityItem[]
  data_status: 'verified' | 'partial' | 'unavailable' | 'failed'
  limitations: string[]
}

export type MorningBriefStructured = {
  date: string
  timezone: string
  revenue_line: string
  marketing_line: string
  instagram_line: string
  content_line: string
  important: string[]
  recommended_action: string | null
  pending_approval: string | null
}

export type AwaySummary = {
  business: string[]
  marketing: string[]
  instagram: string[]
  content: string[]
  actions_taken: string[]
  waiting_approval: string[]
  problems: string[]
  opportunities: string[]
  recommend_next: string[]
  limitations: string[]
}
