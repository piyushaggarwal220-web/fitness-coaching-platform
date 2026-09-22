/**
 * Phase 14 strategic memory types — layer on jarvis_memory, not a second store.
 */

import type { JarvisMemoryKind, MemoryHierarchyLevel } from '@/lib/jarvis/memory/kinds'
import type {
  EvidenceLabel,
  MemoryScope,
  StrategicConfidence,
} from '@/lib/jarvis/memory/scopes'

export type MemorySourceType =
  | 'EVENT'
  | 'DECISION'
  | 'ACTION'
  | 'OUTCOME'
  | 'EXPERIMENT'
  | 'ANALYTICS'
  | 'RESEARCH'
  | 'INSTAGRAM'
  | 'META'
  | 'SHOPIFY'
  | 'CONTENT'
  | 'VIDEO'
  | 'USER_EXPLICIT'
  | 'SYSTEM'
  | 'TASK'

export type MemoryRelationType =
  | 'SUPPORTS'
  | 'CONTRADICTS'
  | 'DERIVED_FROM'
  | 'CAUSED_BY'
  | 'RESULTED_IN'
  | 'SUPERSEDES'
  | 'RELATED_TO'
  | 'APPLIES_TO'
  | 'NOT_APPLICABLE_TO'

export type CausalityStance =
  | 'CORRELATION'
  | 'TEMPORAL_ASSOCIATION'
  | 'SUPPORTED_CAUSAL_HYPOTHESIS'
  | 'CAUSALITY_NOT_ESTABLISHED'

export type StrategicEvidenceItem = {
  source_type: MemorySourceType
  source_id: string | null
  observed_at: string
  metric: string | null
  before_value: number | null
  after_value: number | null
  window: string | null
  sample_size: number | null
  confidence: StrategicConfidence
  notes: string | null
}

export type StrategicMemoryCandidate = {
  kind: JarvisMemoryKind
  level: MemoryHierarchyLevel
  title: string
  statement: string
  scope: MemoryScope
  scope_id: string | null
  funnel_id: string | null
  source: string
  source_type: MemorySourceType
  evidence: StrategicEvidenceItem[]
  evidence_label: EvidenceLabel
  confidence: StrategicConfidence
  causality: CausalityStance
  sample_size: number
  tags?: string[]
  /** Taste vs strategy separation */
  domain?: 'STRATEGY' | 'TASTE' | 'OPERATIONS'
}

export type BusinessKnowledgeSnapshot = {
  generated_at: string
  business_model: string[]
  funnels: string[]
  economics: string[]
  current_priorities: string[]
  known_constraints: string[]
  recent_wins: string[]
  recent_failures: string[]
  active_experiments: string[]
  strategic_patterns: string[]
  content_strategy: string[]
  marketing_patterns: string[]
  operational_bottlenecks: string[]
  open_questions: string[]
  stale_assumptions: string[]
  conflicts: string[]
  limitations: string[]
}
