/**
 * Persist Creative Director plans on marketing_content (extended, not duplicated).
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CreativePlan } from '@/lib/jarvis/creative/types'
import { mapDbStatus } from '@/lib/jarvis/creative/types'

export function conceptFingerprint(input: {
  title: string
  hook: string
  source_key: string
  variant?: string | null
}): string {
  return createHash('sha256')
    .update(
      `${input.title.toLowerCase().trim()}::${input.hook.toLowerCase().trim()}::${input.source_key}::${input.variant || ''}`
    )
    .digest('hex')
    .slice(0, 24)
}

export async function findExistingByFingerprint(fingerprint: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('marketing_content')
    .select('id')
    .eq('concept_fingerprint', fingerprint)
    .not('status', 'in', '("archived","rejected")')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function saveCreativePlan(input: {
  plan: CreativePlan
  actorId?: string | null
  sessionId?: string | null
  opportunityId?: string | null
  parentContentId?: string | null
  version?: number
  changeReason?: string | null
  funnelId?: string | null
}): Promise<{ id: string; version: number }> {
  const admin = createAdminClient()
  const version = input.version ?? 1
  const plan = {
    ...input.plan,
    edit_handoff: {
      ...input.plan.edit_handoff,
      creative_id: null as string | null,
    },
  }

  const row = {
    platform: input.plan.platform === 'instagram' ? 'instagram' : 'instagram',
    content_type: 'reel',
    topic: input.plan.pillar,
    hook: input.plan.hook.text,
    script: input.plan.script_beats.map((b) => `[${b.role}/${b.kind}] ${b.text}`).join('\n'),
    caption: input.plan.concept,
    cta: input.plan.cta,
    content_category: input.plan.format,
    reason: input.plan.angle,
    status: mapDbStatus(input.plan.review_status),
    funnel_id: input.funnelId || input.plan.funnel_id,
    parent_content_id: input.parentContentId ?? null,
    version,
    video_session_id: input.sessionId ?? null,
    video_opportunity_id: input.opportunityId ?? null,
    concept_fingerprint: input.plan.concept_fingerprint,
    creative_plan: plan,
    change_reason: input.changeReason ?? null,
    feedback_log: [],
    metadata: {
      creative_director: true,
      phase: 5,
      confidence: input.plan.confidence,
      missing_material: input.plan.missing_material,
      quality_status: input.plan.quality.status,
    },
    created_by: input.actorId ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin
    .from('marketing_content')
    .insert(row)
    .select('id, version')
    .single()

  if (error) throw new Error(error.message)

  // Backfill creative_id into handoff
  const handoff = {
    ...plan.edit_handoff,
    creative_id: data.id,
  }
  await admin
    .from('marketing_content')
    .update({
      creative_plan: { ...plan, edit_handoff: handoff },
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id)

  return { id: data.id, version: data.version }
}

export async function loadCreativeById(id: string): Promise<{
  id: string
  version: number
  parent_content_id: string | null
  status: string
  plan: CreativePlan
  feedback_log: Array<Record<string, unknown>>
  concept_fingerprint: string | null
  video_session_id: string | null
  funnel_id: string | null
} | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_content')
    .select(
      'id, version, parent_content_id, status, creative_plan, feedback_log, concept_fingerprint, video_session_id, funnel_id'
    )
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    version: data.version ?? 1,
    parent_content_id: data.parent_content_id,
    status: data.status,
    plan: data.creative_plan as CreativePlan,
    feedback_log: (data.feedback_log as Array<Record<string, unknown>>) || [],
    concept_fingerprint: data.concept_fingerprint,
    video_session_id: data.video_session_id,
    funnel_id: data.funnel_id,
  }
}

export async function listCreativePlans(input?: {
  sessionId?: string
  status?: string
  limit?: number
}): Promise<
  Array<{
    id: string
    title: string
    hook: string | null
    status: string
    version: number
    objective: string | null
    estimated_duration_sec: number | null
    confidence: string | null
    video_session_id: string | null
    updated_at: string
  }>
> {
  const admin = createAdminClient()
  let q = admin
    .from('marketing_content')
    .select(
      'id, hook, status, version, video_session_id, creative_plan, updated_at, concept_fingerprint'
    )
    .not('creative_plan', 'eq', '{}')
    .order('updated_at', { ascending: false })
    .limit(input?.limit ?? 30)

  if (input?.sessionId) q = q.eq('video_session_id', input.sessionId)
  if (input?.status) q = q.eq('status', input.status)

  const { data } = await q
  return (data ?? []).map((r) => {
    const plan = (r.creative_plan || {}) as Partial<CreativePlan>
    return {
      id: r.id,
      title: plan.title || r.hook || 'Untitled',
      hook: r.hook,
      status: r.status,
      version: r.version ?? 1,
      objective: plan.objective ?? null,
      estimated_duration_sec: plan.estimated_duration_sec ?? null,
      confidence: plan.confidence ?? null,
      video_session_id: r.video_session_id,
      updated_at: r.updated_at,
    }
  })
}

export async function appendFeedbackLog(
  id: string,
  entry: Record<string, unknown>
): Promise<void> {
  const existing = await loadCreativeById(id)
  if (!existing) return
  const admin = createAdminClient()
  await admin
    .from('marketing_content')
    .update({
      feedback_log: [...existing.feedback_log, { ...entry, at: new Date().toISOString() }],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
}

export async function scheduleCreative(input: {
  contentId: string
  plannedDate: string
  pillar?: string
  objective?: string
  format?: string
  actorId?: string | null
}): Promise<{ id: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_creative_calendar')
    .upsert(
      {
        content_id: input.contentId,
        planned_date: input.plannedDate,
        pillar: input.pillar ?? null,
        objective: input.objective ?? null,
        format: input.format ?? null,
        status: 'planned',
        created_by: input.actorId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'content_id,planned_date' }
    )
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  await admin
    .from('marketing_content')
    .update({
      status: 'scheduled',
      ops_state: 'SCHEDULED',
      scheduled_for: `${input.plannedDate}T12:00:00+05:30`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.contentId)

  return { id: data.id }
}
