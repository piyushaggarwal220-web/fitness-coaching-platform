/**
 * Dedupe + coalesce — never lose that multiple events occurred.
 */

import type { JarvisCanonicalEvent } from '@/lib/jarvis/events/types'
import { getEventDefinition } from '@/lib/jarvis/events/registry'

export type DedupeClass = 'EXACT_DUPLICATE' | 'NEAR_DUPLICATE' | 'COALESCED' | 'UNIQUE'

export type DedupeDecision = {
  class: DedupeClass
  keep: boolean
  coalesce_into_id?: string | null
  coalesced_count?: number
  reason: string
}

export function classifyAgainstRecent(
  event: JarvisCanonicalEvent,
  recent: {
    id: string
    fingerprint: string
    event_type: string
    entity_id: string | null
    funnel_id: string | null
    created_at: string
    status: string
    coalesced_count?: number
  }[]
): DedupeDecision {
  const def = getEventDefinition(event.event_type)
  const now = Date.parse(event.received_at)

  for (const r of recent) {
    const ageSec = (now - Date.parse(r.created_at)) / 1000
    if (ageSec < 0 || ageSec > def.dedupe_window_seconds) continue

    if (r.fingerprint === event.fingerprint) {
      if (['processing', 'PROCESSING', 'INVESTIGATING', 'QUEUED', 'pending'].includes(r.status)) {
        return {
          class: 'EXACT_DUPLICATE',
          keep: false,
          coalesce_into_id: r.id,
          reason: 'Same fingerprint already queued/processing.',
        }
      }
      if (ageSec <= def.coalesce_window_seconds) {
        return {
          class: 'COALESCED',
          keep: false,
          coalesce_into_id: r.id,
          coalesced_count: (r.coalesced_count ?? 1) + 1,
          reason: 'Coalesced into open window for same fingerprint.',
        }
      }
      return {
        class: 'NEAR_DUPLICATE',
        keep: false,
        coalesce_into_id: r.id,
        reason: 'Near-duplicate within dedupe window.',
      }
    }

    // Near: same type + entity within coalesce window
    if (
      r.event_type === event.event_type &&
      r.entity_id &&
      r.entity_id === event.entity_id &&
      (r.funnel_id || null) === (event.funnel_id || null) &&
      ageSec <= def.coalesce_window_seconds
    ) {
      return {
        class: 'COALESCED',
        keep: false,
        coalesce_into_id: r.id,
        coalesced_count: (r.coalesced_count ?? 1) + 1,
        reason: 'Same entity/type coalesced.',
      }
    }
  }

  return { class: 'UNIQUE', keep: true, reason: 'No duplicate within window.' }
}
