/**
 * Content operations queue — “What needs my attention?”
 */

import { computeNextAction, nextActionLabel } from '@/lib/jarvis/content-ops/next-action'
import { computeContentPriority } from '@/lib/jarvis/content-ops/priority'
import { pipelineColumnForState } from '@/lib/jarvis/content-ops/state-machine'
import {
  listContentOps,
  resolveOpsState,
  type ContentOpsRow,
} from '@/lib/jarvis/content-ops/store'
import type { ContentQueueItem, PipelineColumn } from '@/lib/jarvis/content-ops/types'
import { PIPELINE_COLUMNS } from '@/lib/jarvis/content-ops/types'

function rowToQueueItem(row: ContentOpsRow): ContentQueueItem {
  const state = resolveOpsState(row)
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const next = computeNextAction({
    ops_state: state,
    has_footage: Boolean(meta.footage_session_id || meta.video_session_id),
    has_creative: Boolean(row.hook || row.caption || meta.creative_plan_id),
    has_edl: Boolean(row.edl_id),
    render_complete: Boolean(row.render_job_id || meta.media_url || row.published_media_id),
    has_approved_caption: Boolean(row.approved_caption || row.caption),
    scheduled_for: row.scheduled_for,
    published_media_id: row.published_media_id,
    blocking_reason: row.blocking_reason,
    measurement_status: row.measurement_status,
  })
  const pri = computeContentPriority({
    blocked: Boolean(next.blocking_reason),
    deadline_at: row.scheduled_for,
    business_objective_aligned: Boolean(row.reason),
    ready_for_user_action: ['REVIEW', 'REVISION_REQUESTED', 'APPROVED'].includes(state),
    user_priority: row.user_priority,
    scheduled_for: row.scheduled_for,
  })

  return {
    content_id: row.id,
    title: row.topic || 'Untitled',
    objective: row.reason,
    pillar: row.content_mix_pillar || row.content_category,
    format: row.content_type,
    status: state,
    priority: row.ops_priority ?? pri.score,
    priority_factors: pri.factors,
    creative_plan_id: (meta.creative_plan_id as string) || null,
    footage_session_id: (meta.footage_session_id as string) || (meta.video_session_id as string) || null,
    edl_id: row.edl_id,
    render_job_id: row.render_job_id,
    review_status: state === 'REVIEW' || state === 'REVISION_REQUESTED' ? state : null,
    publish_status: row.published_media_id
      ? 'published'
      : state === 'SCHEDULED' || state === 'PUBLISHING'
        ? state.toLowerCase()
        : null,
    scheduled_time: row.scheduled_for,
    published_media_id: row.published_media_id,
    performance_status: row.measurement_status,
    next_action: next.action,
    next_action_label: nextActionLabel(next.action),
    blocking_reason: next.blocking_reason,
    topic: row.topic,
    caption: row.approved_caption || row.caption,
  }
}

export async function getContentQueue(opts?: { limit?: number }): Promise<{
  items: ContentQueueItem[]
  needs_attention: ContentQueueItem[]
  by_column: Record<PipelineColumn, ContentQueueItem[]>
}> {
  const rows = await listContentOps({ limit: opts?.limit ?? 100 })
  const items = rows.map(rowToQueueItem).sort((a, b) => b.priority - a.priority)

  const needs_attention = items.filter(
    (i) =>
      i.blocking_reason ||
      ['REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'FAILED'].includes(i.status) ||
      ['UPLOAD_FOOTAGE', 'REVIEW_VIDEO', 'APPROVE', 'SCHEDULE', 'FIX_FAILED'].includes(i.next_action)
  )

  const by_column = Object.fromEntries(PIPELINE_COLUMNS.map((c) => [c, [] as ContentQueueItem[]])) as Record<
    PipelineColumn,
    ContentQueueItem[]
  >
  for (const item of items) {
    const col = pipelineColumnForState(item.status)
    if (col) by_column[col].push(item)
  }

  return { items, needs_attention, by_column }
}

export async function getContentOpsSummary(): Promise<{
  today_content: number
  needs_attention: number
  scheduled: number
  publishing: number
  published: number
  measuring: number
}> {
  const { items, needs_attention } = await getContentQueue({ limit: 200 })
  return {
    today_content: items.filter((i) => !['COMPLETED', 'ARCHIVED', 'CANCELLED'].includes(i.status))
      .length,
    needs_attention: needs_attention.length,
    scheduled: items.filter((i) => i.status === 'SCHEDULED').length,
    publishing: items.filter((i) => i.status === 'PUBLISHING').length,
    published: items.filter((i) => i.status === 'PUBLISHED').length,
    measuring: items.filter((i) => i.status === 'MEASURING').length,
  }
}
