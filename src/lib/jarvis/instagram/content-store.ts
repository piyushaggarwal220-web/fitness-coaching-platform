/**
 * Local Instagram content store — marketing_content is the source of truth for
 * plans, drafts, and manually recorded organic performance. Does not invent tables.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { DataStatus } from '@/lib/jarvis/diagnostics/diagnostic-types'
import type { InstagramContentPlan } from '@/lib/jarvis/instagram/types'

export type MarketingContentStatus =
  | 'idea'
  | 'draft'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'ready_for_edit'
  | 'scheduled'
  | 'posted'
  | 'archived'

export type MarketingContentRow = {
  id: string
  platform: string
  content_type: string
  topic: string | null
  hook: string | null
  script: string | null
  caption: string | null
  keywords: unknown
  hashtags: unknown
  cta: string | null
  content_category: string | null
  reason: string | null
  scheduled_for: string | null
  posted_at: string | null
  views: number | null
  reach: number | null
  watch_time_seconds: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  followers_gained: number | null
  status: string
  metadata: Record<string, unknown> | null
  funnel_id?: string | null
  created_at: string
  updated_at: string
}

function asNumberOrNull(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

export async function listLocalInstagramContent(limit = 50): Promise<{
  source: string
  data_status: DataStatus
  retrieved_at: string
  period: null
  timezone: string
  value: MarketingContentRow[] | null
  note: string
  error?: string
}> {
  const retrieved_at = new Date().toISOString()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('marketing_content')
      .select('*')
      .eq('platform', 'instagram')
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100))

    if (error) {
      return {
        source: 'marketing_content',
        data_status: 'failed',
        retrieved_at,
        period: null,
        timezone: 'Asia/Kolkata',
        value: null,
        note: 'marketing_content query failed. Missing rows are not zero performance.',
        error: error.message,
      }
    }

    const rows = (data ?? []) as MarketingContentRow[]
    return {
      source: 'marketing_content',
      data_status: 'verified',
      retrieved_at,
      period: null,
      timezone: 'Asia/Kolkata',
      value: rows,
      note:
        rows.length === 0
          ? 'No local Instagram marketing_content rows (verified empty set).'
          : `Loaded ${rows.length} local Instagram content row(s).`,
    }
  } catch (err) {
    return {
      source: 'marketing_content',
      data_status: 'failed',
      retrieved_at,
      period: null,
      timezone: 'Asia/Kolkata',
      value: null,
      note: 'marketing_content unavailable. Not zero.',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function getLocalInstagramContentById(contentId: string): Promise<{
  ok: boolean
  value: MarketingContentRow | null
  data_status: DataStatus
  source: string
  error?: string
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_content')
    .select('*')
    .eq('id', contentId)
    .eq('platform', 'instagram')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      value: null,
      data_status: 'failed',
      source: 'marketing_content',
      error: error.message,
    }
  }
  return {
    ok: true,
    value: (data as MarketingContentRow) ?? null,
    data_status: data ? 'verified' : 'unavailable',
    source: 'marketing_content',
    error: data ? undefined : 'not_found',
  }
}

export async function saveInstagramContentPlan(input: {
  plan: InstagramContentPlan
  actorId?: string | null
  status?: MarketingContentStatus
  videoJobId?: string | null
  funnelId?: string | null
  extraMetadata?: Record<string, unknown>
}): Promise<{
  ok: boolean
  content_id?: string
  data_status: DataStatus
  source: string
  retrieved_at: string
  error?: string
}> {
  const retrieved_at = new Date().toISOString()
  const admin = createAdminClient()
  const funnelFromMeta =
    typeof input.extraMetadata?.funnel_id === 'string'
      ? (input.extraMetadata.funnel_id as string)
      : null
  const funnel_id = input.funnelId || funnelFromMeta || null
  const { data, error } = await admin
    .from('marketing_content')
    .insert({
      platform: 'instagram',
      content_type:
        input.plan.format === 'reel'
          ? 'reel'
          : input.plan.format === 'carousel'
            ? 'carousel'
            : input.plan.format === 'story'
              ? 'story'
              : 'post',
      topic: input.plan.topic,
      hook: input.plan.hook,
      script: input.plan.reel_concept,
      caption: input.plan.caption,
      cta: input.plan.cta,
      content_category: input.plan.objective,
      reason: input.plan.jarvis_recommendation.join(' | ').slice(0, 600) || null,
      status: input.status ?? 'idea',
      funnel_id,
      keywords: [],
      hashtags: [],
      metadata: {
        planner_v1: true,
        format: input.plan.format,
        target_audience: input.plan.target_audience,
        objective: input.plan.objective,
        suggested_publishing_window: input.plan.suggested_publishing_window,
        research_references: input.plan.research_references,
        sourced_facts: input.plan.sourced_facts,
        jarvis_inference: input.plan.jarvis_inference,
        jarvis_recommendation: input.plan.jarvis_recommendation,
        video_job_id: input.videoJobId ?? null,
        ...(funnel_id ? { funnel_id } : {}),
        ...(input.extraMetadata ?? {}),
      },
      created_by: input.actorId ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      data_status: 'failed',
      source: 'marketing_content',
      retrieved_at,
      error: error.message,
    }
  }

  return {
    ok: true,
    content_id: data?.id,
    data_status: 'verified',
    source: 'marketing_content',
    retrieved_at,
  }
}

export async function saveInstagramDraft(input: {
  contentId?: string
  topic?: string
  hook?: string
  caption?: string
  cta?: string
  script?: string
  contentType?: 'reel' | 'carousel' | 'story' | 'post' | 'idea'
  metadata?: Record<string, unknown>
  actorId?: string | null
  /** Full plan form used by generate_draft */
  plan?: InstagramContentPlan
  extraMetadata?: Record<string, unknown>
}): Promise<{
  ok: boolean
  content_id?: string
  data_status: DataStatus
  source: string
  retrieved_at: string
  error?: string
}> {
  if (input.plan && !input.contentId) {
    return saveInstagramContentPlan({
      plan: input.plan,
      actorId: input.actorId,
      status: 'draft',
      extraMetadata: {
        ...(input.extraMetadata ?? {}),
        ...(input.metadata ?? {}),
      },
    })
  }

  const retrieved_at = new Date().toISOString()
  const admin = createAdminClient()

  if (input.contentId) {
    const existing = await getLocalInstagramContentById(input.contentId)
    const prevMeta = (existing.value?.metadata ?? {}) as Record<string, unknown>
    const { data, error } = await admin
      .from('marketing_content')
      .update({
        topic: input.topic,
        hook: input.hook,
        caption: input.caption,
        cta: input.cta,
        script: input.script,
        content_type: input.contentType,
        status: 'draft',
        metadata: {
          ...prevMeta,
          ...(input.metadata ?? {}),
          ...(input.extraMetadata ?? {}),
        },
        updated_at: retrieved_at,
      })
      .eq('id', input.contentId)
      .eq('platform', 'instagram')
      .select('id')
      .maybeSingle()
    if (error) {
      return {
        ok: false,
        data_status: 'failed',
        source: 'marketing_content',
        retrieved_at,
        error: error.message,
      }
    }
    return {
      ok: true,
      content_id: data?.id ?? input.contentId,
      data_status: 'verified',
      source: 'marketing_content',
      retrieved_at,
    }
  }

  const { data, error } = await admin
    .from('marketing_content')
    .insert({
      platform: 'instagram',
      content_type: input.contentType ?? 'idea',
      topic: input.topic ?? null,
      hook: input.hook ?? null,
      caption: input.caption ?? null,
      cta: input.cta ?? null,
      script: input.script ?? null,
      status: 'draft',
      keywords: [],
      hashtags: [],
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.extraMetadata ?? {}),
      },
      created_by: input.actorId ?? null,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      data_status: 'failed',
      source: 'marketing_content',
      retrieved_at,
      error: error.message,
    }
  }

  return {
    ok: true,
    content_id: data?.id,
    data_status: 'verified',
    source: 'marketing_content',
    retrieved_at,
  }
}

/** Partial patch — merges metadata, never overwrites with undefined fields. */
export async function updateInstagramDraft(input: {
  contentId: string
  patch: {
    status?: MarketingContentStatus
    topic?: string
    hook?: string
    caption?: string
    cta?: string
    script?: string
    metadata?: Record<string, unknown>
  }
  actorId?: string | null
}): Promise<{
  ok: boolean
  content_id?: string
  data_status: DataStatus
  source: string
  error?: string
}> {
  const existing = await getLocalInstagramContentById(input.contentId)
  if (!existing.ok || !existing.value) {
    return {
      ok: false,
      data_status: 'failed',
      source: 'marketing_content',
      error: existing.error || 'not_found',
    }
  }

  const prevMeta = (existing.value.metadata ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (input.patch.status != null) update.status = input.patch.status
  if (input.patch.topic != null) update.topic = input.patch.topic
  if (input.patch.hook != null) update.hook = input.patch.hook
  if (input.patch.caption != null) update.caption = input.patch.caption
  if (input.patch.cta != null) update.cta = input.patch.cta
  if (input.patch.script != null) update.script = input.patch.script
  if (input.patch.metadata) {
    update.metadata = { ...prevMeta, ...input.patch.metadata }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_content')
    .update(update)
    .eq('id', input.contentId)
    .eq('platform', 'instagram')
    .select('id')
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      data_status: 'failed',
      source: 'marketing_content',
      error: error.message,
    }
  }

  return {
    ok: true,
    content_id: data?.id ?? input.contentId,
    data_status: 'verified',
    source: 'marketing_content',
  }
}

/** Engagement score only from verified numeric fields — null metrics do not become 0. */
export function localEngagementScore(row: MarketingContentRow): number | null {
  const parts = [row.likes, row.comments, row.shares, row.saves]
    .map(asNumberOrNull)
    .filter((n): n is number => n != null)
  if (!parts.length) return null
  return parts.reduce((a, b) => a + b, 0)
}
