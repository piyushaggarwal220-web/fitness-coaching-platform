/**
 * Phase 9 — Content Operations types.
 * Operational lifecycle for Instagram content pipeline.
 */

export const CONTENT_OPS_STATES = [
  'IDEA',
  'OPPORTUNITY',
  'PLANNED',
  'CREATIVE_READY',
  'EDIT_READY',
  'EDITING',
  'REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'MEASURING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
  'CANCELLED',
  'ARCHIVED',
] as const

export type ContentOpsState = (typeof CONTENT_OPS_STATES)[number]

export const PIPELINE_COLUMNS = [
  'Ideas',
  'Planning',
  'Creative',
  'Editing',
  'Review',
  'Approved',
  'Scheduled',
  'Published',
  'Measuring',
] as const

export type PipelineColumn = (typeof PIPELINE_COLUMNS)[number]

export const NEXT_ACTIONS = [
  'UPLOAD_FOOTAGE',
  'GENERATE_CREATIVE',
  'CREATE_EDIT',
  'RENDER',
  'REVIEW_VIDEO',
  'APPLY_REVISION',
  'APPROVE',
  'SCHEDULE',
  'WAITING_FOR_PUBLISH',
  'COLLECT_PERFORMANCE',
  'WAIT_MEASUREMENT_WINDOW',
  'NONE',
  'UNBLOCK',
  'RETRY_PUBLISH',
  'FIX_FAILED',
] as const

export type ContentNextAction = (typeof NEXT_ACTIONS)[number]

export type ContentMixPillar =
  | 'education'
  | 'authority'
  | 'transformation'
  | 'personal'
  | 'promotion'
  | string

export type CadencePreset = '3_per_week' | '5_per_week' | 'daily' | 'custom'

export type PublishPackage = {
  content_id: string
  media_ref: string | null
  video_job_id?: string | null
  caption: string
  first_comment?: string | null
  hashtags?: string[]
  scheduled_time: string | null
  platform: 'instagram'
  media_type: 'IMAGE' | 'VIDEO' | 'REELS'
  metadata: Record<string, unknown>
}

export type ContentQueueItem = {
  content_id: string
  title: string
  objective: string | null
  pillar: string | null
  format: string | null
  status: ContentOpsState
  priority: number
  priority_factors: string[]
  creative_plan_id: string | null
  footage_session_id: string | null
  edl_id: string | null
  render_job_id: string | null
  review_status: string | null
  publish_status: string | null
  scheduled_time: string | null
  published_media_id: string | null
  performance_status: string | null
  next_action: ContentNextAction
  next_action_label: string
  blocking_reason: string | null
  topic: string | null
  caption: string | null
}

export type ScheduleProposalSlot = {
  date: string
  time_local: string
  timezone: string
  content_id?: string | null
  title: string
  format: string
  objective: string | null
  pillar: ContentMixPillar
  reason: string
  basis: string[]
  collision_flags: string[]
}

export type ContentBatchProposal = {
  fingerprint: string
  window_start: string
  window_end: string
  cadence: { posts_per_week: number; mix: Record<string, number> }
  items: ScheduleProposalSlot[]
  rationale: string[]
  limitations: string[]
}

export type DailyContentBrief = {
  date: string
  timezone: string
  published: number
  scheduled: number
  needs_review: number
  needs_footage: number
  trend_opportunity: number
  performance_note: string | null
  next_action: string | null
  meaningful: boolean
}

export type WeeklyContentReport = {
  week_start: string
  week_end: string
  posts_published: number
  posts_scheduled: number
  posts_completed: number
  content_mix: Record<string, number>
  top_observed_topics: string[]
  strongest_observed_formats: string[]
  content_gaps: string[]
  external_trends: string[]
  performance_changes: string[]
  pending_work: string[]
  next_week_proposal_summary: string | null
  limitations: string[]
}
