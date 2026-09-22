/**
 * Phase 13 — canonical event types (triggers only; never executable instructions).
 */

export const EVENT_SOURCES = [
  'BACKGROUND_POLL',
  'WEBHOOK',
  'INTERNAL',
  'CRON',
  'USER',
  'PROVIDER',
  'SYSTEM',
] as const

export type EventSource = (typeof EVENT_SOURCES)[number]

export const EVENT_SEVERITIES = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'] as const
export type EventSeverity = (typeof EVENT_SEVERITIES)[number]

export const EVENT_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type EventPriority = (typeof EVENT_PRIORITIES)[number]

export const SIGNIFICANCE_ACTIONS = [
  'IGNORE',
  'LOG',
  'DIGEST',
  'INVESTIGATE',
  'ALERT',
  'URGENT',
] as const
export type SignificanceAction = (typeof SIGNIFICANCE_ACTIONS)[number]

export const EVENT_STATUSES = [
  'pending', // legacy Phase 2
  'processing',
  'processed',
  'skipped',
  'failed',
  'RECEIVED',
  'VALIDATED',
  'DUPLICATE',
  'COALESCED',
  'QUEUED',
  'PROCESSING',
  'INVESTIGATING',
  'ACTION_PENDING',
  'COMPLETED',
  'IGNORED',
  'DEFERRED',
  'FAILED',
] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const JARVIS_EVENT_TYPES = [
  // Business
  'business.revenue_changed',
  'business.order_created',
  'business.order_cancelled',
  'business.refund_created',
  'business.funnel_conversion_changed',
  // Meta
  'meta.sync_completed',
  'meta.spend_changed',
  'meta.cpa_changed',
  'meta.roas_changed',
  'meta.campaign_status_changed',
  'meta.adset_status_changed',
  'meta.ad_status_changed',
  'meta.delivery_anomaly',
  // Instagram
  'instagram.post_published',
  'instagram.performance_changed',
  'instagram.reach_spike',
  'instagram.engagement_spike',
  'instagram.content_overdue',
  // Shopify
  'shopify.order_created',
  'shopify.order_cancelled',
  'shopify.product_changed',
  'shopify.inventory_changed',
  'shopify.revenue_changed',
  // Content
  'content.created',
  'content.approved',
  'content.rejected',
  'content.scheduled',
  'content.overdue',
  'content.stuck',
  'content.published',
  'content.measurement_due',
  // Video
  'video.uploaded',
  'video.render_started',
  'video.render_completed',
  'video.render_failed',
  'video.provider_error',
  // System
  'system.integration_failed',
  'system.integration_recovered',
  'system.health_degraded',
  'system.health_recovered',
  'system.cost_limit_reached',
  'system.execution_blocked',
  'system.verification_failed',
  // Research
  'research.completed',
  'research.signal_detected',
  // Task
  'task.created',
  'task.blocked',
  'task.overdue',
  'task.failed',
  'task.completed',
  // Legacy / misc
  'funnel.conversion_drop',
  'experiment.completed',
] as const

export type JarvisEventType = (typeof JARVIS_EVENT_TYPES)[number]

export type JarvisEventSystems =
  | 'META'
  | 'INSTAGRAM'
  | 'SHOPIFY'
  | 'CONTENT'
  | 'VIDEO'
  | 'RESEARCH'
  | 'SYSTEM'
  | 'BUSINESS'
  | 'TASK'
  | 'OTHER'

export type JarvisCanonicalEvent = {
  id?: string
  event_type: JarvisEventType | string
  source: EventSource
  source_event_id: string | null
  occurred_at: string
  received_at: string
  business_date: string
  system: JarvisEventSystems
  entity_type: string | null
  entity_id: string | null
  funnel_id: string | null
  severity: EventSeverity
  priority: EventPriority
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
  fingerprint: string
  schema_version: number
}

export type SignificanceResult = {
  action: SignificanceAction
  priority: EventPriority
  reason: string
  magnitude: number | null
  relative_change: number | null
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA'
  baseline: Record<string, unknown> | null
}

export type EventIngestInput = {
  event_type: string
  source?: EventSource
  source_event_id?: string | null
  occurred_at?: string | Date | null
  system?: JarvisEventSystems
  entity_type?: string | null
  entity_id?: string | null
  funnel_id?: string | null
  severity?: EventSeverity
  payload?: Record<string, unknown>
  metadata?: Record<string, unknown>
  /** When true, process pipeline without runTool writes / investigations that spend */
  dry_run?: boolean
  /** Replay must default dry_run */
  replay?: boolean
}
