/**
 * Durable event store — extends existing jarvis_events table.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { JarvisCanonicalEvent, SignificanceResult } from '@/lib/jarvis/events/types'

export type StoredJarvisEvent = {
  id: string
  event_type: string
  source: string | null
  source_event_id: string | null
  fingerprint: string | null
  occurred_at: string | null
  received_at: string | null
  business_date: string | null
  system: string | null
  entity_type: string | null
  entity_id: string | null
  funnel_id: string | null
  severity: string | null
  priority: string | null
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
  status: string
  coalesced_count: number
  parent_event_id: string | null
  significance: string | null
  significance_reason: string | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  processed_at: string | null
}

function mapRow(row: Record<string, unknown>): StoredJarvisEvent {
  return {
    id: String(row.id),
    event_type: String(row.event_type),
    source: (row.source as string) ?? null,
    source_event_id: (row.source_event_id as string) ?? null,
    fingerprint: (row.fingerprint as string) ?? null,
    occurred_at: (row.occurred_at as string) ?? null,
    received_at: (row.received_at as string) ?? row.created_at?.toString() ?? null,
    business_date: (row.business_date as string) ?? null,
    system: (row.system as string) ?? null,
    entity_type: (row.entity_type as string) ?? null,
    entity_id: (row.entity_id as string) ?? null,
    funnel_id: (row.funnel_id as string) ?? null,
    severity: (row.severity as string) ?? null,
    priority: (row.priority as string) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    status: String(row.status),
    coalesced_count: Number(row.coalesced_count ?? 1),
    parent_event_id: (row.parent_event_id as string) ?? null,
    significance: (row.significance as string) ?? null,
    significance_reason: (row.significance_reason as string) ?? null,
    result: (row.result as Record<string, unknown>) ?? null,
    error: (row.error as string) ?? null,
    created_at: String(row.created_at),
    processed_at: (row.processed_at as string) ?? null,
  }
}

export async function insertCanonicalEvent(
  event: JarvisCanonicalEvent,
  status: string,
  significance?: SignificanceResult | null
): Promise<StoredJarvisEvent | null> {
  const admin = createAdminClient()
  const row = {
    event_type: event.event_type,
    payload: event.payload,
    status,
    source: event.source,
    source_event_id: event.source_event_id,
    fingerprint: event.fingerprint,
    occurred_at: event.occurred_at,
    received_at: event.received_at,
    business_date: event.business_date,
    system: event.system,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    funnel_id: event.funnel_id,
    severity: event.severity,
    priority: significance?.priority || event.priority,
    metadata: event.metadata,
    coalesced_count: 1,
    significance: significance?.action ?? null,
    significance_reason: significance?.reason ?? null,
    schema_version: event.schema_version,
  }

  const { data, error } = await admin.from('jarvis_events').insert(row).select('*').maybeSingle()
  if (error) {
    // Fallback for pre-migration schema
    if (/column|schema/i.test(error.message)) {
      const legacy = await admin
        .from('jarvis_events')
        .insert({
          event_type: event.event_type,
          payload: { ...event.payload, _canonical: event },
          status: status === 'QUEUED' ? 'pending' : status.toLowerCase(),
        })
        .select('*')
        .maybeSingle()
      if (legacy.error || !legacy.data) {
        console.error('[jarvis-events] insert failed', legacy.error?.message || error.message)
        return null
      }
      return mapRow(legacy.data as Record<string, unknown>)
    }
    console.error('[jarvis-events] insert failed', error.message)
    return null
  }
  return data ? mapRow(data as Record<string, unknown>) : null
}

export async function bumpCoalescedCount(id: string, count: number): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('jarvis_events')
    .update({
      coalesced_count: count,
      status: 'COALESCED',
    })
    .eq('id', id)
}

export async function updateEventStatus(
  id: string,
  patch: {
    status: string
    result?: Record<string, unknown>
    error?: string | null
    processed_at?: string | null
    significance?: string | null
    significance_reason?: string | null
    parent_event_id?: string | null
  }
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('jarvis_events').update(patch).eq('id', id)
  if (error && /column|schema/i.test(error.message)) {
    await admin
      .from('jarvis_events')
      .update({
        status: mapLegacyStatus(patch.status),
        result: patch.result,
        error: patch.error,
        processed_at: patch.processed_at,
      })
      .eq('id', id)
  }
}

function mapLegacyStatus(status: string): string {
  if (['QUEUED', 'RECEIVED', 'VALIDATED'].includes(status)) return 'pending'
  if (['PROCESSING', 'INVESTIGATING', 'ACTION_PENDING'].includes(status)) return 'processing'
  if (['COMPLETED', 'IGNORED', 'DUPLICATE', 'COALESCED'].includes(status)) return 'processed'
  if (status === 'DEFERRED') return 'skipped'
  if (status === 'FAILED') return 'failed'
  return status
}

export async function listRecentByFingerprint(
  fingerprint: string,
  sinceIso: string
): Promise<StoredJarvisEvent[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_events')
    .select('*')
    .eq('fingerprint', fingerprint)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return []
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export async function listRecentEvents(limit = 40): Promise<StoredJarvisEvent[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export async function getEventById(id: string): Promise<StoredJarvisEvent | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_events').select('*').eq('id', id).maybeSingle()
  return data ? mapRow(data as Record<string, unknown>) : null
}

export async function claimQueuedEvents(limit: number): Promise<StoredJarvisEvent[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_events')
    .select('*')
    .in('status', ['pending', 'QUEUED', 'RECEIVED'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  const claimed: StoredJarvisEvent[] = []
  for (const row of data ?? []) {
    const { data: updated } = await admin
      .from('jarvis_events')
      .update({ status: 'PROCESSING' })
      .eq('id', row.id)
      .in('status', ['pending', 'QUEUED', 'RECEIVED'])
      .select('*')
      .maybeSingle()
    if (updated) claimed.push(mapRow(updated as Record<string, unknown>))
  }
  return claimed
}

export async function countEventsSince(sinceIso: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('jarvis_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceIso)
  return count ?? 0
}

export async function countInvestigationsSince(sinceIso: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('jarvis_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceIso)
    .in('significance', ['INVESTIGATE', 'ALERT', 'URGENT'])
  return count ?? 0
}

export async function getEventHealth(): Promise<Record<string, unknown>> {
  const admin = createAdminClient()
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const [
    { count: queued },
    { count: failed },
    { count: lastHour },
    { data: oldest },
  ] = await Promise.all([
    admin
      .from('jarvis_events')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'QUEUED', 'RECEIVED']),
    admin
      .from('jarvis_events')
      .select('id', { count: 'exact', head: true })
      .in('status', ['failed', 'FAILED']),
    admin
      .from('jarvis_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', hourAgo),
    admin
      .from('jarvis_events')
      .select('id, created_at, event_type, status')
      .in('status', ['pending', 'QUEUED', 'RECEIVED'])
      .order('created_at', { ascending: true })
      .limit(1),
  ])

  return {
    queue_depth: queued ?? 0,
    failed_count: failed ?? 0,
    events_last_hour: lastHour ?? 0,
    oldest_unprocessed: oldest?.[0] ?? null,
    note: 'Phase 13 event health — processing via existing cron cycle.',
  }
}
