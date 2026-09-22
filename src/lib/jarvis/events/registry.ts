/**
 * Event registry — structured defaults. default_action is never EXECUTE.
 */

import type {
  EventPriority,
  EventSeverity,
  EventSource,
  JarvisEventSystems,
  JarvisEventType,
  SignificanceAction,
} from '@/lib/jarvis/events/types'

export type EventDefinition = {
  event_type: JarvisEventType | string
  system: JarvisEventSystems
  default_severity: EventSeverity
  default_priority: EventPriority
  dedupe_window_seconds: number
  coalesce_window_seconds: number
  cooldown_seconds: number
  significance_default: SignificanceAction
  max_concurrency: number
  notification: 'NONE' | 'DIGEST' | 'NOTIFY' | 'URGENT_NOTIFY'
  investigation_pattern: string | null
  /** Events are data — never auto-execute */
  default_action: 'OBSERVE' | 'LOG' | 'INVESTIGATE' | 'ALERT'
}

function def(
  partial: Omit<EventDefinition, 'default_action' | 'max_concurrency'> & {
    default_action?: EventDefinition['default_action']
    max_concurrency?: number
  }
): EventDefinition {
  return {
    max_concurrency: 1,
    default_action: 'INVESTIGATE',
    ...partial,
  }
}

const REGISTRY: Record<string, EventDefinition> = {
  'meta.sync_completed': def({
    event_type: 'meta.sync_completed',
    system: 'META',
    default_severity: 'INFO',
    default_priority: 'P3',
    dedupe_window_seconds: 300,
    coalesce_window_seconds: 120,
    cooldown_seconds: 600,
    significance_default: 'LOG',
    notification: 'NONE',
    investigation_pattern: null,
    default_action: 'OBSERVE',
  }),
  'meta.cpa_changed': def({
    event_type: 'meta.cpa_changed',
    system: 'META',
    default_severity: 'WARNING',
    default_priority: 'P1',
    dedupe_window_seconds: 900,
    coalesce_window_seconds: 120,
    cooldown_seconds: 1800,
    significance_default: 'INVESTIGATE',
    notification: 'NOTIFY',
    investigation_pattern: 'funnel_performance',
    default_action: 'INVESTIGATE',
  }),
  'meta.roas_changed': def({
    event_type: 'meta.roas_changed',
    system: 'META',
    default_severity: 'WARNING',
    default_priority: 'P1',
    dedupe_window_seconds: 900,
    coalesce_window_seconds: 120,
    cooldown_seconds: 1800,
    significance_default: 'INVESTIGATE',
    notification: 'NOTIFY',
    investigation_pattern: 'funnel_performance',
  }),
  'meta.spend_changed': def({
    event_type: 'meta.spend_changed',
    system: 'META',
    default_severity: 'NOTICE',
    default_priority: 'P2',
    dedupe_window_seconds: 600,
    coalesce_window_seconds: 180,
    cooldown_seconds: 900,
    significance_default: 'DIGEST',
    notification: 'DIGEST',
    investigation_pattern: null,
    default_action: 'LOG',
  }),
  'meta.delivery_anomaly': def({
    event_type: 'meta.delivery_anomaly',
    system: 'META',
    default_severity: 'WARNING',
    default_priority: 'P1',
    dedupe_window_seconds: 1800,
    coalesce_window_seconds: 300,
    cooldown_seconds: 1800,
    significance_default: 'ALERT',
    notification: 'NOTIFY',
    investigation_pattern: 'business_health',
  }),
  'business.revenue_changed': def({
    event_type: 'business.revenue_changed',
    system: 'BUSINESS',
    default_severity: 'NOTICE',
    default_priority: 'P2',
    dedupe_window_seconds: 600,
    coalesce_window_seconds: 300,
    cooldown_seconds: 900,
    significance_default: 'DIGEST',
    notification: 'DIGEST',
    investigation_pattern: 'sales_drop',
    default_action: 'LOG',
  }),
  'business.order_created': def({
    event_type: 'business.order_created',
    system: 'BUSINESS',
    default_severity: 'INFO',
    default_priority: 'P3',
    dedupe_window_seconds: 3600,
    coalesce_window_seconds: 60,
    cooldown_seconds: 0,
    significance_default: 'LOG',
    notification: 'NONE',
    investigation_pattern: null,
    default_action: 'LOG',
  }),
  'business.refund_created': def({
    event_type: 'business.refund_created',
    system: 'BUSINESS',
    default_severity: 'NOTICE',
    default_priority: 'P2',
    dedupe_window_seconds: 3600,
    coalesce_window_seconds: 120,
    cooldown_seconds: 600,
    significance_default: 'DIGEST',
    notification: 'DIGEST',
    investigation_pattern: null,
    default_action: 'LOG',
  }),
  'instagram.reach_spike': def({
    event_type: 'instagram.reach_spike',
    system: 'INSTAGRAM',
    default_severity: 'NOTICE',
    default_priority: 'P2',
    dedupe_window_seconds: 3600,
    coalesce_window_seconds: 600,
    cooldown_seconds: 7200,
    significance_default: 'INVESTIGATE',
    notification: 'DIGEST',
    investigation_pattern: null,
  }),
  'instagram.content_overdue': def({
    event_type: 'instagram.content_overdue',
    system: 'INSTAGRAM',
    default_severity: 'NOTICE',
    default_priority: 'P3',
    dedupe_window_seconds: 7200,
    coalesce_window_seconds: 1800,
    cooldown_seconds: 14400,
    significance_default: 'DIGEST',
    notification: 'DIGEST',
    investigation_pattern: null,
    default_action: 'LOG',
  }),
  'content.stuck': def({
    event_type: 'content.stuck',
    system: 'CONTENT',
    default_severity: 'WARNING',
    default_priority: 'P2',
    dedupe_window_seconds: 7200,
    coalesce_window_seconds: 1800,
    cooldown_seconds: 14400,
    significance_default: 'INVESTIGATE',
    notification: 'NOTIFY',
    investigation_pattern: null,
  }),
  'content.overdue': def({
    event_type: 'content.overdue',
    system: 'CONTENT',
    default_severity: 'NOTICE',
    default_priority: 'P3',
    dedupe_window_seconds: 3600,
    coalesce_window_seconds: 900,
    cooldown_seconds: 7200,
    significance_default: 'DIGEST',
    notification: 'DIGEST',
    investigation_pattern: null,
    default_action: 'LOG',
  }),
  'video.render_failed': def({
    event_type: 'video.render_failed',
    system: 'VIDEO',
    default_severity: 'WARNING',
    default_priority: 'P1',
    dedupe_window_seconds: 1800,
    coalesce_window_seconds: 300,
    cooldown_seconds: 1800,
    significance_default: 'INVESTIGATE',
    notification: 'NOTIFY',
    investigation_pattern: null,
  }),
  'video.uploaded': def({
    event_type: 'video.uploaded',
    system: 'VIDEO',
    default_severity: 'INFO',
    default_priority: 'P3',
    dedupe_window_seconds: 3600,
    coalesce_window_seconds: 60,
    cooldown_seconds: 0,
    significance_default: 'LOG',
    notification: 'NONE',
    investigation_pattern: null,
    default_action: 'OBSERVE',
  }),
  'system.integration_failed': def({
    event_type: 'system.integration_failed',
    system: 'SYSTEM',
    default_severity: 'CRITICAL',
    default_priority: 'P0',
    dedupe_window_seconds: 1800,
    coalesce_window_seconds: 300,
    cooldown_seconds: 1800,
    significance_default: 'URGENT',
    notification: 'URGENT_NOTIFY',
    investigation_pattern: 'business_health',
    default_action: 'ALERT',
  }),
  'system.cost_limit_reached': def({
    event_type: 'system.cost_limit_reached',
    system: 'SYSTEM',
    default_severity: 'CRITICAL',
    default_priority: 'P0',
    dedupe_window_seconds: 3600,
    coalesce_window_seconds: 600,
    cooldown_seconds: 3600,
    significance_default: 'ALERT',
    notification: 'URGENT_NOTIFY',
    investigation_pattern: null,
    default_action: 'ALERT',
  }),
  'system.verification_failed': def({
    event_type: 'system.verification_failed',
    system: 'SYSTEM',
    default_severity: 'WARNING',
    default_priority: 'P1',
    dedupe_window_seconds: 1800,
    coalesce_window_seconds: 300,
    cooldown_seconds: 1800,
    significance_default: 'ALERT',
    notification: 'NOTIFY',
    investigation_pattern: null,
    default_action: 'ALERT',
  }),
  'system.execution_blocked': def({
    event_type: 'system.execution_blocked',
    system: 'SYSTEM',
    default_severity: 'NOTICE',
    default_priority: 'P2',
    dedupe_window_seconds: 900,
    coalesce_window_seconds: 300,
    cooldown_seconds: 1800,
    significance_default: 'DIGEST',
    notification: 'DIGEST',
    investigation_pattern: null,
    default_action: 'LOG',
  }),
  'funnel.conversion_drop': def({
    event_type: 'funnel.conversion_drop',
    system: 'BUSINESS',
    default_severity: 'WARNING',
    default_priority: 'P1',
    dedupe_window_seconds: 1800,
    coalesce_window_seconds: 300,
    cooldown_seconds: 1800,
    significance_default: 'INVESTIGATE',
    notification: 'NOTIFY',
    investigation_pattern: 'sales_drop',
  }),
  'experiment.completed': def({
    event_type: 'experiment.completed',
    system: 'OTHER',
    default_severity: 'INFO',
    default_priority: 'P3',
    dedupe_window_seconds: 86400,
    coalesce_window_seconds: 60,
    cooldown_seconds: 0,
    significance_default: 'LOG',
    notification: 'DIGEST',
    investigation_pattern: null,
    default_action: 'LOG',
  }),
}

export function getEventDefinition(eventType: string): EventDefinition {
  if (REGISTRY[eventType]) return REGISTRY[eventType]
  const system = inferSystem(eventType)
  return def({
    event_type: eventType,
    system,
    default_severity: 'INFO',
    default_priority: 'P3',
    dedupe_window_seconds: 900,
    coalesce_window_seconds: 180,
    cooldown_seconds: 900,
    significance_default: 'LOG',
    notification: 'NONE',
    investigation_pattern: null,
    default_action: 'LOG',
  })
}

export function listRegisteredEventTypes(): string[] {
  return Object.keys(REGISTRY)
}

export function inferSystem(eventType: string): JarvisEventSystems {
  const root = eventType.split('.')[0] || ''
  switch (root) {
    case 'meta':
      return 'META'
    case 'instagram':
      return 'INSTAGRAM'
    case 'shopify':
      return 'SHOPIFY'
    case 'content':
      return 'CONTENT'
    case 'video':
      return 'VIDEO'
    case 'research':
      return 'RESEARCH'
    case 'system':
      return 'SYSTEM'
    case 'business':
    case 'funnel':
      return 'BUSINESS'
    case 'task':
      return 'TASK'
    default:
      return 'OTHER'
  }
}

/** Allowed sources for a given type — all sources permitted; registry documents intent. */
export function isValidSource(source: string): source is EventSource {
  return [
    'BACKGROUND_POLL',
    'WEBHOOK',
    'INTERNAL',
    'CRON',
    'USER',
    'PROVIDER',
    'SYSTEM',
  ].includes(source)
}
