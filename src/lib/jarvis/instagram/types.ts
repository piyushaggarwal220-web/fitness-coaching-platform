import type { DataStatus, MetricProvenance } from '@/lib/jarvis/diagnostics/diagnostic-types'

export type InstagramMetricEnvelope<T> = {
  source: string
  data_status: DataStatus
  retrieved_at: string
  period: { start?: string | null; end?: string | null; label?: string | null } | null
  timezone: string | null
  value: T | null
  note?: string
  error?: string
  error_code?: string | null
  provider_status?: number | null
  provenance?: MetricProvenance
}

export type InstagramProfile = {
  id: string
  username: string | null
  name: string | null
  biography: string | null
  website: string | null
  profile_picture_url: string | null
  followers_count: number | null
  follows_count: number | null
  media_count: number | null
  account_type: string | null
}

export type InstagramMediaItem = {
  id: string
  caption: string | null
  media_type: string | null
  media_product_type: string | null
  media_url: string | null
  permalink: string | null
  thumbnail_url: string | null
  timestamp: string | null
  like_count: number | null
  comments_count: number | null
}

export type InstagramInsightMetric = {
  name: string
  period: string | null
  values: { value: number | null; end_time?: string | null }[]
  title?: string | null
  description?: string | null
}

export type InstagramContentPlan = {
  topic: string
  hook: string
  format: 'reel' | 'carousel' | 'story' | 'post'
  reel_concept: string
  caption: string
  cta: string
  target_audience: string
  objective: string
  suggested_publishing_window: string
  research_references: string[]
  sourced_facts: string[]
  jarvis_inference: string[]
  jarvis_recommendation: string[]
}

export type InstagramPublishRequest = {
  contentId?: string
  caption: string
  mediaUrl?: string
  videoJobId?: string
  mediaType?: 'IMAGE' | 'VIDEO' | 'REELS'
}

export type InstagramAuditRecord = {
  action: string
  target: string | null
  actor: string | null
  approval_state: string | null
  result: string
  provider_response_status: number | null
  timestamp: string
  error_redacted: string | null
}
