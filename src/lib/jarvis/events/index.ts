/**
 * Phase 13 Event-Driven Business Brain — nervous system for existing Jarvis.
 * Events trigger; orchestrator + Phase 12 decide/execute.
 */

export type * from '@/lib/jarvis/events/types'
export { eventIngestSchema, scrubUntrustedPayload, isKnownEventType } from '@/lib/jarvis/events/schema'
export {
  getEventDefinition,
  listRegisteredEventTypes,
  inferSystem,
} from '@/lib/jarvis/events/registry'
export {
  normalizeJarvisEvent,
  buildEventFingerprint,
  asOptionalNumber,
} from '@/lib/jarvis/events/normalize'
export { classifyAgainstRecent } from '@/lib/jarvis/events/dedupe'
export { evaluateSignificance } from '@/lib/jarvis/events/significance'
export { shouldStormDefer, DEFAULT_STORM_LIMITS } from '@/lib/jarvis/events/storm'
export {
  ingestJarvisEvent,
  processJarvisEventQueue,
  summarizeEventsForBrief,
} from '@/lib/jarvis/events/dispatcher'
export {
  listRecentEvents,
  getEventById,
  getEventHealth,
  type StoredJarvisEvent,
} from '@/lib/jarvis/events/store'
export { explainStoredEvent } from '@/lib/jarvis/events/explain'
