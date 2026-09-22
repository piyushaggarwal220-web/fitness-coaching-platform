/**
 * Phase 5 Creative Director types.
 * Phase 4 answers "what is in the footage?"
 * Phase 5 answers "what should we create from it?"
 * Does NOT render, publish, or generate final EDL.
 */

import type { SourceMapping, ConfidenceLevel } from '@/lib/jarvis/video/intelligence/types'

export type CreativeObjective =
  | 'AWARENESS'
  | 'AUTHORITY'
  | 'ENGAGEMENT'
  | 'EDUCATION'
  | 'LEAD_GENERATION'
  | 'SALES'
  | 'RETENTION'
  | 'TRUST'
  | 'COMMUNITY'

export type CreativeFormat =
  | 'TALKING_HEAD'
  | 'EDUCATIONAL'
  | 'MYTH_BUST'
  | 'STORY'
  | 'HOT_TAKE'
  | 'FAQ'
  | 'LIST'
  | 'TRANSFORMATION'
  | 'CASE_STUDY'
  | 'DEMONSTRATION'
  | 'REACTION'
  | 'BROLL'
  | 'TESTIMONIAL'

export type HookCategory =
  | 'CURIOSITY'
  | 'CONTRARIAN'
  | 'MISTAKE'
  | 'QUESTION'
  | 'WARNING'
  | 'RESULT'
  | 'MYTH'
  | 'AUTHORITY'
  | 'STORY'
  | 'CHALLENGE'
  | 'SPECIFIC_NUMBER'
  | 'PAIN_POINT'

export type ScriptSegmentKind =
  | 'SPOKEN_FOOTAGE'
  | 'SUGGESTED_OVERLAY'
  | 'NEW_RECORDING_REQUIRED'
  | 'BROLL_REQUIRED'
  | 'TEXT_OVERLAY'

export type CreativeReviewStatus =
  | 'IDEA'
  | 'DRAFT'
  | 'REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED'
  | 'READY_FOR_EDIT'
  | 'SCHEDULED'
  | 'POSTED'
  | 'ARCHIVED'

export type StructureId =
  | 'HOOK_PROBLEM_SOLUTION_CTA'
  | 'HOOK_MYTH_TRUTH_EXPLAIN_CTA'
  | 'HOOK_STORY_LESSON_CTA'
  | 'HOOK_THREE_POINTS_CTA'
  | 'QUESTION_ANSWER_EXAMPLE_CTA'

export type AudienceAssumptionKind = 'ASSUMPTION' | 'INFERENCE' | 'USER_PROVIDED' | 'OBSERVED'

export type CreativeAudience = {
  label: string
  pain_points: string[]
  desires: string[]
  knowledge_level: string | null
  objections: string[]
  content_preferences: string[]
  assumption_kind: AudienceAssumptionKind
}

export type CreativeHook = {
  text: string
  type: HookCategory
  reason: string
  confidence: ConfidenceLevel
  source_support: boolean
  source_excerpt: string | null
  missing_footage: boolean
  claim_flags: string[]
}

export type ScriptBeat = {
  role: string
  kind: ScriptSegmentKind
  text: string
  source?: SourceMapping | null
  duration_estimate_sec: number
  notes?: string
}

export type CreativeQualityResult = {
  status: 'READY' | 'NEEDS_REVISION'
  reasons: string[]
  claim_review_required: boolean
  claim_flags: string[]
}

export type CreativePlan = {
  title: string
  concept: string
  angle: string
  objective: CreativeObjective
  audience: CreativeAudience
  pillar: string
  format: CreativeFormat
  platform: string
  tone: string
  hook: CreativeHook
  structure_id: StructureId
  structure_steps: string[]
  script_beats: ScriptBeat[]
  cta: string
  cta_objective_match: boolean
  source_segments: SourceMapping[]
  missing_material: string[]
  overlays: string[]
  new_recording_requirements: string[]
  estimated_duration_sec: number
  target_duration_sec: number | null
  confidence: ConfidenceLevel
  review_status: CreativeReviewStatus
  preferences_applied: string[]
  /** Phase 7 taste influences (USER_TASTE only). */
  taste_influences?: Array<{
    dimension: string
    preference_key: string
    preference_value: string
    confidence: number
    reason: string
  }>
  /** Audience signals — never confused with user taste. */
  audience_notes?: string[]
  lessons_considered: string[]
  current_instruction_override: string | null
  funnel_id: string | null
  business_objective_note: string | null
  ordering_reason: string | null
  claim_flags: string[]
  quality: CreativeQualityResult
  /** Structured handoff for Phase 6 — not an EDL. */
  edit_handoff: EditHandoffPayload
  evidence: string[]
  concept_fingerprint: string
  variant_label: string | null
  parent_fingerprint: string | null
}

export type EditHandoffPayload = {
  creative_id: string | null
  duration: number
  source_segments: SourceMapping[]
  sequence: Array<{ role: string; kind: ScriptSegmentKind; source?: SourceMapping | null; text: string }>
  captions: string[]
  overlays: string[]
  transitions: string[]
  music_direction: string | null
  new_recording_segments: string[]
  cta: string
  note: string
}

export type CreativeInput = {
  session_id?: string
  opportunity_id?: string
  idea?: string
  objective?: CreativeObjective | string
  audience?: string
  platform?: string
  format?: CreativeFormat | string
  duration_sec?: number
  count?: number
  funnel_id?: string
  tone?: string
  cta?: string
  pillars?: string[]
  current_instruction?: string
  force_new_variants?: boolean
  actorId?: string | null
  save?: boolean
}

export type CreativeFeedback = {
  creative_id: string
  feedback: string
  remember_preference?: boolean
  actorId?: string | null
}

export const DEFAULT_PILLARS = [
  'FAT_LOSS',
  'MUSCLE_GAIN',
  'NUTRITION',
  'TRAINING',
  'CARDIO',
  'RECOVERY',
  'BEGINNER_MISTAKES',
  'MYTHS',
  'PERSONAL_STORY',
  'TRANSFORMATION',
  'LIFESTYLE',
  'COACHING',
  'BUSINESS',
  'AUTHORITY',
] as const

export const STRUCTURE_CATALOG: Record<StructureId, string[]> = {
  HOOK_PROBLEM_SOLUTION_CTA: ['HOOK', 'PROBLEM', 'SOLUTION', 'CTA'],
  HOOK_MYTH_TRUTH_EXPLAIN_CTA: ['HOOK', 'MYTH', 'TRUTH', 'EXPLANATION', 'CTA'],
  HOOK_STORY_LESSON_CTA: ['HOOK', 'STORY', 'LESSON', 'CTA'],
  HOOK_THREE_POINTS_CTA: ['HOOK', 'POINT_1', 'POINT_2', 'POINT_3', 'CTA'],
  QUESTION_ANSWER_EXAMPLE_CTA: ['QUESTION', 'ANSWER', 'EXAMPLE', 'CTA'],
}

export function mapDbStatus(status: CreativeReviewStatus): string {
  const map: Record<CreativeReviewStatus, string> = {
    IDEA: 'idea',
    DRAFT: 'draft',
    REVIEW: 'review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    REVISION_REQUESTED: 'revision_requested',
    READY_FOR_EDIT: 'ready_for_edit',
    SCHEDULED: 'scheduled',
    POSTED: 'posted',
    ARCHIVED: 'archived',
  }
  return map[status]
}

export function fromDbStatus(status: string): CreativeReviewStatus {
  const map: Record<string, CreativeReviewStatus> = {
    idea: 'IDEA',
    draft: 'DRAFT',
    review: 'REVIEW',
    approved: 'APPROVED',
    rejected: 'REJECTED',
    revision_requested: 'REVISION_REQUESTED',
    ready_for_edit: 'READY_FOR_EDIT',
    scheduled: 'SCHEDULED',
    posted: 'POSTED',
    archived: 'ARCHIVED',
  }
  return map[status] ?? 'DRAFT'
}
