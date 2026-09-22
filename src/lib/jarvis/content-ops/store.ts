/**
 * Durable content ops store on marketing_content.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  assertTransition,
  legacyStatusToOpsState,
  opsStateToLegacyStatus,
} from '@/lib/jarvis/content-ops/state-machine'
import { computeNextAction } from '@/lib/jarvis/content-ops/next-action'
import { computeContentPriority } from '@/lib/jarvis/content-ops/priority'
import { recordContentOpsTransition } from '@/lib/jarvis/content-ops/audit'
import type { ContentOpsState, PublishPackage } from '@/lib/jarvis/content-ops/types'
import { createHash } from 'node:crypto'

export type ContentOpsRow = {
  id: string
  topic: string | null
  hook: string | null
  caption: string | null
  approved_caption: string | null
  content_type: string
  content_category: string | null
  content_mix_pillar: string | null
  reason: string | null
  status: string
  ops_state: string | null
  ops_priority: number | null
  next_action: string | null
  blocking_reason: string | null
  scheduled_for: string | null
  posted_at: string | null
  edl_id: string | null
  render_job_id: string | null
  opportunity_fingerprint: string | null
  publish_idempotency_key: string | null
  published_media_id: string | null
  published_permalink: string | null
  publish_attempt_id: string | null
  measurement_status: string | null
  publish_package: Record<string, unknown> | null
  user_priority: number | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export function resolveOpsState(row: {
  ops_state?: string | null
  status?: string | null
}): ContentOpsState {
  if (row.ops_state && typeof row.ops_state === 'string') {
    return row.ops_state as ContentOpsState
  }
  return legacyStatusToOpsState(row.status)
}

export function publishIdempotencyKey(contentId: string): string {
  return createHash('sha256').update(`ig-publish:${contentId}`).digest('hex').slice(0, 32)
}

export async function getContentOpsById(contentId: string): Promise<ContentOpsRow | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_content')
    .select('*')
    .eq('id', contentId)
    .maybeSingle()
  if (error || !data) return null
  return data as ContentOpsRow
}

export async function listContentOps(opts?: {
  states?: ContentOpsState[]
  limit?: number
}): Promise<ContentOpsRow[]> {
  const admin = createAdminClient()
  let q = admin
    .from('marketing_content')
    .select('*')
    .eq('platform', 'instagram')
    .order('ops_priority', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(opts?.limit ?? 100)

  if (opts?.states?.length) {
    q = q.in('ops_state', opts.states)
  }

  const { data, error } = await q
  if (error) return []
  return (data ?? []) as ContentOpsRow[]
}

export async function createContentOpsItem(input: {
  title: string
  objective?: string | null
  pillar?: string | null
  format?: string
  opsState?: ContentOpsState
  opportunityFingerprint?: string | null
  metadata?: Record<string, unknown>
  actorId?: string | null
}): Promise<{ ok: boolean; content_id?: string; error?: string }> {
  const admin = createAdminClient()
  const state = input.opsState ?? 'IDEA'
  const { data, error } = await admin
    .from('marketing_content')
    .insert({
      platform: 'instagram',
      content_type: input.format ?? 'reel',
      topic: input.title,
      reason: input.objective ?? null,
      content_category: input.pillar ?? null,
      content_mix_pillar: input.pillar ?? null,
      status: opsStateToLegacyStatus(state),
      ops_state: state,
      opportunity_fingerprint: input.opportunityFingerprint ?? null,
      next_action: 'GENERATE_CREATIVE',
      metadata: {
        ...(input.metadata ?? {}),
        phase9: true,
      },
      created_by: input.actorId ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? 'insert_failed' }
  }

  await recordContentOpsTransition({
    contentId: data.id,
    previousState: null,
    newState: state,
    reason: 'created',
    actor: input.actorId ?? 'jarvis',
  })

  return { ok: true, content_id: data.id }
}

export async function transitionContentOps(input: {
  contentId: string
  to: ContentOpsState
  reason?: string
  actor?: string | null
  patch?: Record<string, unknown>
}): Promise<{ ok: boolean; previous?: ContentOpsState; error?: string }> {
  const row = await getContentOpsById(input.contentId)
  if (!row) return { ok: false, error: 'content_not_found' }

  const previous = resolveOpsState(row)
  const check = assertTransition(previous, input.to)
  if (!check.ok) return { ok: false, previous, error: check.error }

  const nextCtx = computeNextAction({
    ops_state: input.to,
    has_footage: Boolean(row.metadata?.footage_session_id || row.metadata?.video_session_id),
    has_creative: Boolean(row.hook || row.caption || row.metadata?.creative_plan_id),
    has_edl: Boolean(row.edl_id),
    render_complete: Boolean(
      row.render_job_id ||
        (row.metadata as Record<string, unknown> | null)?.media_url ||
        row.published_media_id
    ),
    has_approved_caption: Boolean(row.approved_caption || row.caption),
    scheduled_for: row.scheduled_for,
    published_media_id: row.published_media_id,
    blocking_reason: null,
    measurement_status: row.measurement_status,
  })

  const pri = computeContentPriority({
    blocked: Boolean(nextCtx.blocking_reason),
    deadline_at: row.scheduled_for,
    business_objective_aligned: Boolean(row.reason),
    ready_for_user_action: ['REVIEW', 'REVISION_REQUESTED', 'APPROVED'].includes(input.to),
    user_priority: row.user_priority,
    scheduled_for: row.scheduled_for,
  })

  const admin = createAdminClient()
  const { error } = await admin
    .from('marketing_content')
    .update({
      ops_state: input.to,
      status: opsStateToLegacyStatus(input.to),
      next_action: nextCtx.action,
      blocking_reason: nextCtx.blocking_reason,
      ops_priority: pri.score,
      ops_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(input.patch ?? {}),
    })
    .eq('id', input.contentId)

  if (error) return { ok: false, previous, error: error.message }

  await recordContentOpsTransition({
    contentId: input.contentId,
    previousState: previous,
    newState: input.to,
    reason: input.reason ?? null,
    actor: input.actor ?? 'jarvis',
  })

  return { ok: true, previous }
}

export async function refreshContentNextAction(contentId: string): Promise<void> {
  const row = await getContentOpsById(contentId)
  if (!row) return
  const state = resolveOpsState(row)
  const next = computeNextAction({
    ops_state: state,
    has_footage: Boolean(row.metadata?.footage_session_id || row.metadata?.video_session_id),
    has_creative: Boolean(row.hook || row.caption || row.metadata?.creative_plan_id),
    has_edl: Boolean(row.edl_id),
    render_complete: Boolean(
      row.render_job_id || (row.metadata as Record<string, unknown> | null)?.media_url
    ),
    has_approved_caption: Boolean(row.approved_caption || row.caption),
    scheduled_for: row.scheduled_for,
    published_media_id: row.published_media_id,
    blocking_reason: row.blocking_reason,
    measurement_status: row.measurement_status,
  })
  const admin = createAdminClient()
  await admin
    .from('marketing_content')
    .update({
      next_action: next.action,
      blocking_reason: next.blocking_reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentId)
}

export async function savePublishPackage(
  contentId: string,
  pkg: PublishPackage
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('marketing_content')
    .update({
      publish_package: pkg,
      approved_caption: pkg.caption,
      publish_idempotency_key: publishIdempotencyKey(contentId),
      updated_at: new Date().toISOString(),
    })
    .eq('id', contentId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function linkContentArtifacts(input: {
  contentId: string
  edlId?: string | null
  renderJobId?: string | null
  footageSessionId?: string | null
  creativePlanId?: string | null
}): Promise<void> {
  const row = await getContentOpsById(input.contentId)
  if (!row) return
  const meta = { ...(row.metadata ?? {}) }
  if (input.footageSessionId) meta.footage_session_id = input.footageSessionId
  if (input.creativePlanId) meta.creative_plan_id = input.creativePlanId
  const admin = createAdminClient()
  await admin
    .from('marketing_content')
    .update({
      edl_id: input.edlId ?? row.edl_id,
      render_job_id: input.renderJobId ?? row.render_job_id,
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.contentId)
  await refreshContentNextAction(input.contentId)
}
