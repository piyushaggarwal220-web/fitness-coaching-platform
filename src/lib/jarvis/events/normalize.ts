/**
 * Normalize inbound events — Asia/Kolkata business calendar; never invent zeros.
 */

import { createHash } from 'crypto'
import { BUSINESS_TIMEZONE, zonedYmd } from '@/lib/time/business-calendar'
import { getEventDefinition, inferSystem } from '@/lib/jarvis/events/registry'
import { scrubUntrustedPayload } from '@/lib/jarvis/events/schema'
import type { EventIngestInput, JarvisCanonicalEvent } from '@/lib/jarvis/events/types'

function asIso(value: string | Date | null | undefined, fallback: Date): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value)
    if (Number.isFinite(t)) return new Date(t).toISOString()
  }
  return fallback.toISOString()
}

/** Preserve null / undefined — do not coerce to 0. */
export function asOptionalNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return null
}

export function buildEventFingerprint(input: {
  event_type: string
  system: string
  entity_id: string | null
  funnel_id: string | null
  business_date: string
  /** Stable significant fields only */
  state_key?: string | null
}): string {
  const parts = [
    input.system,
    input.event_type,
    input.entity_id || '',
    input.funnel_id || 'UNCLASSIFIED',
    input.business_date,
    input.state_key || '',
  ]
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)
}

export function normalizeJarvisEvent(input: EventIngestInput): JarvisCanonicalEvent {
  const now = new Date()
  const def = getEventDefinition(input.event_type)
  const occurredAt = asIso(input.occurred_at ?? null, now)
  const receivedAt = now.toISOString()
  const businessDate = zonedYmd(new Date(occurredAt), BUSINESS_TIMEZONE)
  const system = input.system || def.system || inferSystem(input.event_type)
  const payload = scrubUntrustedPayload(input.payload ?? {})
  const funnelId =
    input.funnel_id === undefined || input.funnel_id === null || input.funnel_id === ''
      ? null
      : String(input.funnel_id)

  // Never guess funnel from price / amount in payload
  if (funnelId == null && (payload.price != null || payload.amount != null)) {
    payload.funnel_note = 'UNCLASSIFIED — funnel not provided; price is not used to assign funnel'
  }

  const entityId = input.entity_id ?? (payload.entity_id != null ? String(payload.entity_id) : null)
  const stateKey =
    payload.state_key != null
      ? String(payload.state_key)
      : payload.metric != null
        ? String(payload.metric)
        : null

  const fingerprint = buildEventFingerprint({
    event_type: input.event_type,
    system,
    entity_id: entityId,
    funnel_id: funnelId,
    business_date: businessDate,
    state_key: stateKey,
  })

  return {
    event_type: input.event_type,
    source: input.source || 'INTERNAL',
    source_event_id: input.source_event_id ?? null,
    occurred_at: occurredAt,
    received_at: receivedAt,
    business_date: businessDate,
    system,
    entity_type: input.entity_type ?? null,
    entity_id: entityId,
    funnel_id: funnelId,
    severity: input.severity || def.default_severity,
    priority: def.default_priority,
    payload,
    metadata: {
      ...(input.metadata ?? {}),
      dry_run: Boolean(input.dry_run),
      replay: Boolean(input.replay),
      timezone: BUSINESS_TIMEZONE,
    },
    fingerprint,
    schema_version: 13,
  }
}
