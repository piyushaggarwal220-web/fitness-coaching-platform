/**
 * Post-publish measurement — links content → IG media → snapshots → outcomes.
 * AUDIENCE_SIGNAL only — never auto-writes USER_TASTE.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getContentOpsById, transitionContentOps } from '@/lib/jarvis/content-ops/store'
import { remember } from '@/lib/jarvis/memory/business-memory'

export const MEASUREMENT_WINDOWS_HOURS = [24, 48, 72, 168] as const

export type MeasurementWindow = (typeof MEASUREMENT_WINDOWS_HOURS)[number]

export async function linkPublishedMedia(input: {
  contentId: string
  mediaId: string
  permalink?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('marketing_content')
    .update({
      published_media_id: input.mediaId,
      published_permalink: input.permalink ?? null,
      measurement_status: 'pending',
      updated_at: new Date().toISOString(),
      metadata: {
        ig_media_id: input.mediaId,
        ig_permalink: input.permalink ?? null,
      },
    })
    .eq('id', input.contentId)
}

export async function startMeasurement(contentId: string): Promise<{ ok: boolean; note: string }> {
  const row = await getContentOpsById(contentId)
  if (!row?.published_media_id) {
    return { ok: false, note: 'No published_media_id — cannot measure' }
  }
  await transitionContentOps({
    contentId,
    to: 'MEASURING',
    reason: 'measurement_window_started',
    patch: { measurement_status: 'measuring' },
  })

  return {
    ok: true,
    note: 'Entered MEASURING. Link media to existing Instagram sync; Phase 3 outcomes attach when a decision id exists.',
  }
}

/**
 * Compare reach to median of comparison set. No causality claims.
 */
export function compareReachToBaseline(input: {
  reach: number | null
  comparisonReaches: number[]
}): { ok: boolean; statement: string | null; data_status: string } {
  if (input.reach == null || !Number.isFinite(input.reach)) {
    return {
      ok: false,
      statement: null,
      data_status: 'unavailable',
    }
  }
  const comps = input.comparisonReaches.filter((n) => typeof n === 'number' && Number.isFinite(n))
  if (comps.length < 2) {
    return {
      ok: false,
      statement: 'Insufficient comparison set for relative reach statement.',
      data_status: 'unavailable',
    }
  }
  const sorted = [...comps].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median <= 0) {
    return { ok: false, statement: null, data_status: 'unavailable' }
  }
  const ratio = Math.round((input.reach / median) * 10) / 10
  return {
    ok: true,
    statement: `Reel reached ${ratio}× the median reach of the selected comparison set (n=${comps.length}). Not a causal claim.`,
    data_status: 'verified',
  }
}

export async function recordAudienceSignalFromContent(input: {
  contentId: string
  statement: string
  metrics?: Record<string, number | null>
}): Promise<{ ok: boolean }> {
  await remember({
    category: 'audience',
    kind: 'HYPOTHESIS',
    title: `Audience signal: content ${input.contentId.slice(0, 8)}`,
    summary: input.statement,
    confidence: 'medium',
    tags: ['audience_signal', 'not_user_taste'],
    details: {
      memory_kind_label: 'AUDIENCE_SIGNAL',
      content_id: input.contentId,
      metrics: input.metrics ?? {},
      not_user_taste: true,
      no_causality: true,
    },
    evidence: [input.statement],
    source: 'instagram_content_ops_measurement',
  })
  return { ok: true }
}

export async function completeMeasurement(contentId: string): Promise<void> {
  const admin = createAdminClient()
  const row = await getContentOpsById(contentId)
  if (!row) return

  const { data: peers } = await admin
    .from('marketing_content')
    .select('reach')
    .eq('platform', 'instagram')
    .eq('status', 'posted')
    .not('reach', 'is', null)
    .neq('id', contentId)
    .limit(20)

  const cmp = compareReachToBaseline({
    reach: (row as { reach?: number | null }).reach ?? null,
    comparisonReaches: (peers ?? []).map((p) => p.reach as number),
  })

  if (cmp.ok && cmp.statement) {
    await recordAudienceSignalFromContent({
      contentId,
      statement: cmp.statement,
      metrics: {
        reach: (row as { reach?: number | null }).reach ?? null,
        views: (row as { views?: number | null }).views ?? null,
      },
    })
  }

  await transitionContentOps({
    contentId,
    to: 'COMPLETED',
    reason: 'measurement_complete',
    patch: { measurement_status: cmp.ok ? 'measured' : 'unavailable' },
  })
}

export async function getContentProvenance(contentId: string): Promise<Record<string, unknown>> {
  const row = await getContentOpsById(contentId)
  if (!row) return { ok: false, error: 'not_found' }
  const meta = row.metadata ?? {}
  return {
    ok: true,
    content_id: contentId,
    chain: {
      research: meta.research_ref ?? meta.trend_ref ?? null,
      opportunity_fingerprint: row.opportunity_fingerprint,
      creative_plan: meta.creative_plan_id ?? null,
      footage: meta.footage_session_id ?? meta.video_session_id ?? null,
      edl: row.edl_id,
      render: row.render_job_id,
      publish_package: row.publish_package,
      schedule: row.scheduled_for,
      published_media_id: row.published_media_id,
      permalink: row.published_permalink,
      measurement_status: row.measurement_status,
      ops_state: row.ops_state,
    },
    note: 'Provenance links only — metrics may be unavailable without inventing zeros.',
  }
}
