/**
 * Phase 7 Taste Engine — types.
 * USER_TASTE ≠ AUDIENCE_SIGNAL ≠ CURRENT_INSTRUCTION ≠ BUSINESS_OBJECTIVE.
 */

export type TasteDimension =
  | 'HOOK'
  | 'PACING'
  | 'EDITING'
  | 'CAPTIONS'
  | 'TEXT'
  | 'COLOR'
  | 'FRAMING'
  | 'AUDIO'
  | 'CTA'
  | 'CONTENT'

export type TasteScope =
  | 'GLOBAL'
  | 'INSTAGRAM_REEL'
  | 'YOUTUBE_SHORT'
  | 'FAT_LOSS'
  | 'MUSCLE_GAIN'
  | 'EDUCATIONAL'
  | 'TRANSFORMATION'
  | 'PERSONAL_STORY'
  | 'SALES'
  | 'HOOK'
  | 'CTA'
  | 'CREATIVE'
  | 'SESSION'
  | 'FUNNEL'
  | 'CAMPAIGN'
  | 'PLATFORM'

export type TastePolarity = 'PREFER' | 'AVOID' | 'INCREASE' | 'DECREASE' | 'NEUTRAL'

export type TasteInfluenceMode =
  | 'HARD_CONSTRAINT'
  | 'STRONG_PREFERENCE'
  | 'SOFT_PREFERENCE'
  | 'OBSERVATION'

export type TasteStatus = 'CANDIDATE' | 'ACTIVE' | 'CONFLICTED' | 'STALE' | 'REJECTED'

export type TasteSignalKind = 'USER_TASTE' | 'AUDIENCE_SIGNAL'

export type TasteEvidenceType =
  | 'EXPLICIT_FEEDBACK'
  | 'EDL_REVISION'
  | 'RENDER_APPROVAL'
  | 'RENDER_REJECTION'
  | 'CREATIVE_APPROVAL'
  | 'CREATIVE_REJECTION'
  | 'REPEATED_REVISION'
  | 'PERFORMANCE_SIGNAL'
  | 'USER_INSTRUCTION'
  | 'CONFIRMATION'
  | 'REJECTION_OF_PREF'

export type TasteDirection =
  | 'INCREASE'
  | 'DECREASE'
  | 'FASTER'
  | 'SLOWER'
  | 'POSITIVE'
  | 'NEGATIVE'
  | 'PREFER'
  | 'AVOID'
  | 'NEUTRAL'

export type TastePreference = {
  id: string | null
  scope: TasteScope
  scope_id: string | null
  dimension: TasteDimension
  preference_key: string
  preference_value: string
  polarity: TastePolarity
  influence_mode: TasteInfluenceMode
  confidence: number
  evidence_count: number
  positive_evidence_count: number
  negative_evidence_count: number
  source_types: TasteEvidenceType[]
  status: TasteStatus
  signal_kind: TasteSignalKind
  explanation: string | null
  first_observed_at: string
  last_observed_at: string
  confirmed_at: string | null
  rejected_at: string | null
  memory_id: string | null
  fingerprint: string
  history: TasteHistoryEntry[]
}

export type TasteHistoryEntry = {
  at: string
  event: string
  confidence_before: number
  confidence_after: number
  note: string
}

export type TasteEvidence = {
  id: string | null
  preference_id: string | null
  evidence_type: TasteEvidenceType
  dimension: TasteDimension
  preference_key: string
  signal: string
  direction: TasteDirection | null
  confidence: number
  signal_kind: TasteSignalKind
  scope: TasteScope
  scope_id: string | null
  creative_content_id: string | null
  edl_id: string | null
  edl_version: number | null
  render_job_id: string | null
  feedback_text: string | null
  diff_summary: string | null
  extracted: Record<string, unknown>
  fingerprint: string
  created_at: string
}

/** Parsed signal from feedback / diff — not yet a durable preference. */
export type TasteSignal = {
  dimension: TasteDimension
  preference_key: string
  preference_value: string
  polarity: TastePolarity
  direction: TasteDirection
  evidence_type: TasteEvidenceType
  confidence: number
  signal: string
  scope: TasteScope
  is_revision_only: boolean
  is_hard_constraint: boolean
  skip_learning: boolean
  note: string
}

export type TasteProfile = {
  preferences: TastePreference[]
  candidates: TastePreference[]
  conflicts: TastePreference[]
  confirmation_asks: TasteConfirmationAsk[]
  evidence_count: number
  last_updated: string | null
}

export type TasteConfirmationAsk = {
  preference_id: string
  dimension: TasteDimension
  preference_key: string
  preference_value: string
  confidence: number
  evidence_count: number
  ask: string
  scope: TasteScope
}

export type TasteRetrievalContext = {
  platform?: string | null
  format?: string | null
  objective?: string | null
  pillar?: string | null
  funnel_id?: string | null
  content_type?: string | null
  current_instruction?: string | null
  limit?: number
}

export type RetrievedTaste = {
  preferences: TastePreference[]
  audience_signals: TastePreference[]
  conflicts: TastePreference[]
  current_instruction_overrides: string[]
  applied: TasteAppliedHint[]
  note: string
}

export type TasteAppliedHint = {
  dimension: TasteDimension
  preference_key: string
  preference_value: string
  confidence: number
  influence_mode: TasteInfluenceMode
  reason: string
  signal_kind: TasteSignalKind
}
