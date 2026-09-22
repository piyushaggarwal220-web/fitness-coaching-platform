/**
 * Content sessions — batch of uploaded sources for one shoot.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { storeVideoSource, parseSourceRef } from '@/lib/jarvis/video/sources'

export async function createVideoSession(input: {
  title: string
  description?: string | null
  actorId?: string | null
}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_video_sessions')
    .insert({
      title: input.title.slice(0, 200),
      description: input.description?.slice(0, 2000) ?? null,
      created_by: input.actorId ?? null,
      status: 'open',
    })
    .select('*')
    .maybeSingle()
  if (error || !data) throw new Error(error?.message || 'Failed to create session')
  return data
}

export async function listVideoSessions(limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_video_sessions')
    .select(
      'id, title, description, source_count, total_duration_sec, status, opportunity_count, analysis_summary, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50))
  return data ?? []
}

export async function getVideoSession(sessionId: string) {
  const admin = createAdminClient()
  const { data: session } = await admin
    .from('jarvis_video_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return null

  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select(
      'id, source_ref, original_filename, mime_type, byte_size, duration_sec, width, height, fps, aspect_ratio, orientation, has_audio, processing_status, analysis_status, transcription_status, checksum_sha256, error, created_at, updated_at'
    )
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  return { session, sources: sources ?? [] }
}

export async function attachSourceToSession(input: {
  sessionId: string
  sourceId: string
}) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('jarvis_video_sources')
    .update({ session_id: input.sessionId, updated_at: new Date().toISOString() })
    .eq('id', input.sourceId)
  if (error) throw new Error(error.message)
  await refreshSessionAggregates(input.sessionId)
}

export async function ingestSourceIntoSession(input: {
  sessionId: string
  bytes: Buffer
  filename: string
  mimeType: string
  actorId?: string | null
}): Promise<{
  ok: boolean
  source_ref?: string
  id?: string
  duplicate_of?: string
  error?: string
  public_url_exposed: false
}> {
  const admin = createAdminClient()
  const { createHash } = await import('crypto')
  const checksum = createHash('sha256').update(input.bytes).digest('hex')

  // Exact duplicate within session or globally
  const { data: existing } = await admin
    .from('jarvis_video_sources')
    .select('id, source_ref, session_id')
    .eq('checksum_sha256', checksum)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    if (!existing.session_id) {
      await attachSourceToSession({ sessionId: input.sessionId, sourceId: existing.id })
    } else if (existing.session_id !== input.sessionId) {
      // Link reference only — do not reprocess
      await admin
        .from('jarvis_video_sources')
        .update({ session_id: input.sessionId, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      await refreshSessionAggregates(input.sessionId)
    }
    return {
      ok: true,
      source_ref: existing.source_ref,
      id: existing.id,
      duplicate_of: existing.id,
      public_url_exposed: false,
    }
  }

  const stored = await storeVideoSource({
    bytes: input.bytes,
    filename: input.filename,
    mimeType: input.mimeType,
    actorId: input.actorId,
  })
  if (!stored.ok || !stored.id) {
    return { ok: false, error: stored.error, public_url_exposed: false }
  }

  await admin
    .from('jarvis_video_sources')
    .update({
      session_id: input.sessionId,
      processing_status: 'VALID',
      checksum_sha256: checksum,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stored.id)

  await refreshSessionAggregates(input.sessionId)
  return {
    ok: true,
    source_ref: stored.source_ref,
    id: stored.id,
    public_url_exposed: false,
  }
}

export async function refreshSessionAggregates(sessionId: string) {
  const admin = createAdminClient()
  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select('duration_sec, analysis_status, processing_status')
    .eq('session_id', sessionId)

  const source_count = sources?.length ?? 0
  const total_duration_sec = (sources ?? []).reduce(
    (sum, s) => sum + (typeof s.duration_sec === 'number' ? Number(s.duration_sec) : 0),
    0
  )

  const { count: opportunity_count } = await admin
    .from('jarvis_video_opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'candidate')

  let status = 'open'
  if (source_count > 0) {
    const analyzing = (sources ?? []).some((s) => s.analysis_status === 'RUNNING' || s.analysis_status === 'QUEUED')
    const failed = (sources ?? []).every((s) => s.analysis_status === 'FAILED' || s.processing_status === 'FAILED')
    const done = (sources ?? []).every(
      (s) => s.analysis_status === 'COMPLETED' || s.analysis_status === 'UNSUPPORTED'
    )
    const partial = (sources ?? []).some((s) => s.analysis_status === 'COMPLETED')
    if (analyzing) status = 'analyzing'
    else if (failed && source_count > 0) status = 'failed'
    else if (done) status = 'analyzed'
    else if (partial) status = 'partial'
    else status = 'open'
  }

  await admin
    .from('jarvis_video_sessions')
    .update({
      source_count,
      total_duration_sec,
      opportunity_count: opportunity_count ?? 0,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
}

export async function resolveSourceId(sourceRefOrId: string): Promise<string | null> {
  const fromRef = parseSourceRef(sourceRefOrId)
  if (fromRef) return fromRef
  if (/^[0-9a-f-]{36}$/i.test(sourceRefOrId)) return sourceRefOrId
  return null
}
