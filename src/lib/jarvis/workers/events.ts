/**
 * Compatibility shim — Phase 2 emit API delegates to Phase 13 pipeline.
 */

import {
  ingestJarvisEvent,
  processJarvisEventQueue,
} from '@/lib/jarvis/events/dispatcher'

/**
 * Lightweight event bus for Jarvis — store event, process once, no polling loops.
 * @deprecated Prefer ingestJarvisEvent from @/lib/jarvis/events for full metadata.
 */
export async function emitJarvisEvent(
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<string | null> {
  const result = await ingestJarvisEvent({
    event_type: eventType,
    source: 'INTERNAL',
    payload,
  })
  return result.event_id
}

export async function processPendingJarvisEvents(limit = 10): Promise<{
  processed: number
  results: Record<string, unknown>[]
}> {
  return processJarvisEventQueue(limit)
}
