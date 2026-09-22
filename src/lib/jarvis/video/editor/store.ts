/**
 * Durable EDL store.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { EditDecisionList, EdlStatus } from '@/lib/jarvis/video/editor/types'

export async function saveEdl(input: {
  edl: EditDecisionList
  actorId?: string | null
}): Promise<{ id: string; version: number }> {
  const admin = createAdminClient()
  const edl = { ...input.edl, id: null }
  const { data, error } = await admin
    .from('jarvis_video_edls')
    .insert({
      creative_content_id: edl.creative_content_id,
      creative_version: edl.creative_version,
      session_id: edl.session_id,
      version: edl.version,
      parent_edl_id: edl.parent_edl_id,
      title: edl.title,
      objective: edl.objective,
      platform: edl.platform,
      format: edl.format,
      aspect_ratio: edl.aspect_ratio,
      target_duration_ms: edl.target_duration_ms,
      estimated_duration_ms: edl.estimated_duration_ms,
      edl,
      source_manifest: edl.source_manifest,
      warnings: edl.warnings,
      unsupported_features: edl.unsupported_features,
      estimated_render_cost_usd: edl.estimated_render_cost_usd,
      status: edl.status,
      fingerprint: edl.fingerprint,
      revision_reason: edl.revision_reason,
      user_feedback: edl.user_feedback,
      changed_operations: edl.changed_operations,
      feedback_log: [],
      created_by: input.actorId ?? null,
    })
    .select('id, version')
    .single()

  if (error) throw new Error(error.message)

  // Backfill id into stored JSON
  const withId = { ...edl, id: data.id }
  await admin
    .from('jarvis_video_edls')
    .update({ edl: withId, updated_at: new Date().toISOString() })
    .eq('id', data.id)

  return { id: data.id, version: data.version }
}

export async function loadEdl(id: string): Promise<{
  id: string
  version: number
  parent_edl_id: string | null
  status: EdlStatus
  edl: EditDecisionList
  feedback_log: Array<Record<string, unknown>>
  creative_content_id: string | null
  session_id: string | null
} | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_video_edls')
    .select(
      'id, version, parent_edl_id, status, edl, feedback_log, creative_content_id, session_id'
    )
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const edl = data.edl as EditDecisionList
  edl.id = data.id
  return {
    id: data.id,
    version: data.version,
    parent_edl_id: data.parent_edl_id,
    status: data.status as EdlStatus,
    edl,
    feedback_log: (data.feedback_log as Array<Record<string, unknown>>) || [],
    creative_content_id: data.creative_content_id,
    session_id: data.session_id,
  }
}

export async function updateEdlStatus(
  id: string,
  status: EdlStatus,
  extra?: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('jarvis_video_edls')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function listEdls(input?: {
  creativeId?: string
  sessionId?: string
  limit?: number
}): Promise<
  Array<{
    id: string
    title: string | null
    version: number
    status: string
    estimated_duration_ms: number | null
    estimated_render_cost_usd: number | null
    creative_content_id: string | null
    updated_at: string
  }>
> {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_video_edls')
    .select(
      'id, title, version, status, estimated_duration_ms, estimated_render_cost_usd, creative_content_id, updated_at'
    )
    .order('updated_at', { ascending: false })
    .limit(input?.limit ?? 30)
  if (input?.creativeId) q = q.eq('creative_content_id', input.creativeId)
  if (input?.sessionId) q = q.eq('session_id', input.sessionId)
  const { data } = await q
  return data ?? []
}

export async function appendEdlFeedback(
  id: string,
  entry: Record<string, unknown>
): Promise<void> {
  const loaded = await loadEdl(id)
  if (!loaded) return
  const admin = createAdminClient()
  await admin
    .from('jarvis_video_edls')
    .update({
      feedback_log: [...loaded.feedback_log, { ...entry, at: new Date().toISOString() }],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function findEdlByFingerprint(
  fingerprint: string,
  version?: number
): Promise<string | null> {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_video_edls')
    .select('id')
    .eq('fingerprint', fingerprint)
    .order('version', { ascending: false })
    .limit(1)
  if (version != null) q = q.eq('version', version)
  const { data } = await q
  return data?.[0]?.id ?? null
}
