/**
 * Structured event explanations — no invented reasoning.
 */

import type { StoredJarvisEvent } from '@/lib/jarvis/events/store'
import { getEventDefinition } from '@/lib/jarvis/events/registry'

export function explainStoredEvent(event: StoredJarvisEvent | null): {
  ok: boolean
  answer: string
  evidence: string[]
} {
  if (!event) {
    return { ok: false, answer: 'No event record found.', evidence: [] }
  }
  const def = getEventDefinition(event.event_type)
  const evidence = [
    `event_type=${event.event_type}`,
    `source=${event.source || 'unknown'}`,
    `status=${event.status}`,
    `significance=${event.significance || 'n/a'}`,
    `priority=${event.priority || 'n/a'}`,
    `fingerprint=${event.fingerprint || 'n/a'}`,
    event.funnel_id ? `funnel_id=${event.funnel_id}` : 'funnel=UNCLASSIFIED',
    event.entity_id ? `entity=${event.entity_id}` : 'entity=none',
    `coalesced_count=${event.coalesced_count}`,
    event.significance_reason ? `reason=${event.significance_reason}` : '',
  ].filter(Boolean)

  const answer = [
    `What: ${event.event_type} from ${event.source || 'unknown'}.`,
    `When: occurred ${event.occurred_at || event.created_at}; business_date ${event.business_date || 'n/a'}.`,
    `Significance: ${event.significance || 'unset'} — ${event.significance_reason || def.significance_default}.`,
    `Default action class: ${def.default_action} (never direct execute).`,
    `Status: ${event.status}.`,
    event.result ? `Result: ${JSON.stringify(event.result).slice(0, 280)}` : 'Result: none yet.',
  ].join(' ')

  return { ok: true, answer, evidence }
}
