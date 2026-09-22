/**
 * Instagram organic metric snapshot store.
 * Historical SoT for Graph insights — separate from Meta ads marketing_performance.
 * Explicit Meta zeroes are stored as value=0 + status=verified.
 * Unavailable/unsupported stay value=null + status.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { BUSINESS_TIMEZONE, calendarDayWindow } from '@/lib/time/business-calendar'

function istSnapshotDay(at: Date | string): string {
  return calendarDayWindow(BUSINESS_TIMEZONE, typeof at === 'string' ? new Date(at) : at, 0).ymd
}

export type MetricStatus = 'verified' | 'unavailable' | 'unsupported' | 'failed'

export type InstagramMetricSnapshotInput = {
  igAccountId: string
  mediaId: string
  mediaTimestamp?: string | null
  metricName: string
  metricValue: number | null
  metricStatus: MetricStatus
  fetchedAt: string
  mediaType?: string | null
  mediaProductType?: string | null
  syncRunId: string
  providerPeriod?: string | null
  errorRedacted?: string | null
}

export type InstagramMediaUpsertInput = {
  igAccountId: string
  mediaId: string
  username?: string | null
  caption?: string | null
  permalink?: string | null
  mediaType?: string | null
  mediaProductType?: string | null
  mediaTimestamp?: string | null
  likeCount?: number | null
  likeCountStatus: MetricStatus
  commentsCount?: number | null
  commentsCountStatus: MetricStatus
  syncRunId: string
  metadata?: Record<string, unknown>
}

/** Normalize: explicit 0 → verified zero; null → status must not be verified. */
export function normalizeMetricForPersist(
  value: number | null | undefined,
  statusHint?: MetricStatus
): { value: number | null; status: MetricStatus } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { value: null, status: statusHint && statusHint !== 'verified' ? statusHint : 'unavailable' }
  }
  return { value, status: 'verified' }
}

export async function createSyncRun(input: {
  igAccountId: string
  mediaLimit: number
}): Promise<{ id: string } | { error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_instagram_sync_runs')
    .insert({
      ig_account_id: input.igAccountId,
      media_limit: input.mediaLimit,
      status: 'running',
    })
    .select('id')
    .maybeSingle()
  if (error || !data?.id) return { error: error?.message || 'Failed to create sync run' }
  return { id: data.id as string }
}

export async function completeSyncRun(input: {
  id: string
  status: 'completed' | 'partial' | 'failed' | 'budget_exhausted' | 'rate_limited'
  mediaFetched: number
  insightsFetched: number
  snapshotsUpserted: number
  apiCalls: number
  errorRedacted?: string | null
  summary?: Record<string, unknown>
}) {
  const admin = createAdminClient()
  await admin
    .from('marketing_instagram_sync_runs')
    .update({
      status: input.status,
      completed_at: new Date().toISOString(),
      media_fetched: input.mediaFetched,
      insights_fetched: input.insightsFetched,
      snapshots_upserted: input.snapshotsUpserted,
      api_calls: input.apiCalls,
      error_redacted: input.errorRedacted ?? null,
      summary: input.summary ?? {},
    })
    .eq('id', input.id)
}

export async function upsertInstagramMedia(rows: InstagramMediaUpsertInput[]) {
  if (!rows.length) return { upserted: 0 }
  const admin = createAdminClient()
  const payload = rows.map((r) => ({
    ig_account_id: r.igAccountId,
    media_id: r.mediaId,
    username: r.username ?? null,
    caption: r.caption ?? null,
    permalink: r.permalink ?? null,
    media_type: r.mediaType ?? null,
    media_product_type: r.mediaProductType ?? null,
    media_timestamp: r.mediaTimestamp ?? null,
    like_count: r.likeCount ?? null,
    like_count_status: r.likeCountStatus,
    comments_count: r.commentsCount ?? null,
    comments_count_status: r.commentsCountStatus,
    last_synced_at: new Date().toISOString(),
    sync_run_id: r.syncRunId,
    metadata: r.metadata ?? {},
    updated_at: new Date().toISOString(),
  }))
  const { error } = await admin.from('marketing_instagram_media').upsert(payload, {
    onConflict: 'ig_account_id,media_id',
  })
  if (error) throw new Error(error.message)
  return { upserted: payload.length }
}

/**
 * Idempotent daily upsert: same account/media/metric/snapshot_day overwrites.
 * Does not invent zeros for unavailable metrics.
 */
export async function upsertMetricSnapshots(rows: InstagramMetricSnapshotInput[]) {
  if (!rows.length) return { upserted: 0 }
  const admin = createAdminClient()
  const payload = rows.map((r) => {
    const day = istSnapshotDay(r.fetchedAt)
    const normalized = normalizeMetricForPersist(
      r.metricValue,
      r.metricStatus
    )
    // Caller may pass explicit unavailable/unsupported/failed with null value.
    const status =
      r.metricValue === null || r.metricValue === undefined
        ? r.metricStatus === 'verified'
          ? 'unavailable'
          : r.metricStatus
        : normalized.status
    const value =
      r.metricValue === null || r.metricValue === undefined
        ? null
        : normalized.value
    return {
      ig_account_id: r.igAccountId,
      media_id: r.mediaId,
      media_timestamp: r.mediaTimestamp ?? null,
      metric_name: r.metricName,
      metric_value: value,
      metric_status: status,
      fetched_at: r.fetchedAt,
      snapshot_day: day,
      media_type: r.mediaType ?? null,
      media_product_type: r.mediaProductType ?? null,
      sync_run_id: r.syncRunId,
      provider_period: r.providerPeriod ?? null,
      error_redacted: r.errorRedacted ?? null,
    }
  })
  const { error } = await admin.from('marketing_instagram_metric_snapshots').upsert(payload, {
    onConflict: 'ig_account_id,media_id,metric_name,snapshot_day',
  })
  if (error) throw new Error(error.message)
  return { upserted: payload.length }
}

export async function getLatestSyncRun(igAccountId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_instagram_sync_runs')
    .select('*')
    .eq('ig_account_id', igAccountId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function listSyncedMedia(igAccountId: string, limit = 50) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_instagram_media')
    .select('*')
    .eq('ig_account_id', igAccountId)
    .order('media_timestamp', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listMetricSnapshots(input: {
  igAccountId: string
  days?: number
  mediaIds?: string[]
  metricNames?: string[]
  limit?: number
}) {
  const admin = createAdminClient()
  const days = input.days ?? 30
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  const sinceDay = istSnapshotDay(since)

  let q = admin
    .from('marketing_instagram_metric_snapshots')
    .select('*')
    .eq('ig_account_id', input.igAccountId)
    .gte('snapshot_day', sinceDay)
    .order('snapshot_day', { ascending: false })
    .limit(input.limit ?? 2000)

  if (input.mediaIds?.length) q = q.in('media_id', input.mediaIds)
  if (input.metricNames?.length) q = q.in('metric_name', input.metricNames)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** In-memory store for unit tests (no Supabase). */
export type SnapshotTestStore = {
  media: InstagramMediaUpsertInput[]
  snapshots: (InstagramMetricSnapshotInput & { snapshot_day: string })[]
  syncRuns: { id: string; status: string; snapshots_upserted: number }[]
}

export function createMemorySnapshotStore(): SnapshotTestStore & {
  upsertMedia: (rows: InstagramMediaUpsertInput[]) => number
  upsertSnapshots: (rows: InstagramMetricSnapshotInput[]) => number
} {
  const store: SnapshotTestStore & {
    upsertMedia: (rows: InstagramMediaUpsertInput[]) => number
    upsertSnapshots: (rows: InstagramMetricSnapshotInput[]) => number
  } = {
    media: [],
    snapshots: [],
    syncRuns: [],
    upsertMedia(rows) {
      for (const r of rows) {
        const i = store.media.findIndex(
          (m) => m.igAccountId === r.igAccountId && m.mediaId === r.mediaId
        )
        if (i >= 0) store.media[i] = r
        else store.media.push(r)
      }
      return rows.length
    },
    upsertSnapshots(rows) {
      for (const r of rows) {
        const day = istSnapshotDay(r.fetchedAt)
        const value =
          r.metricValue === null || r.metricValue === undefined
            ? null
            : Number.isFinite(r.metricValue)
              ? r.metricValue
              : null
        const status =
          value === null
            ? r.metricStatus === 'verified'
              ? 'unavailable'
              : r.metricStatus
            : 'verified'
        const key = `${r.igAccountId}|${r.mediaId}|${r.metricName}|${day}`
        const existing = store.snapshots.findIndex(
          (s) =>
            `${s.igAccountId}|${s.mediaId}|${s.metricName}|${s.snapshot_day}` === key
        )
        const row = { ...r, metricValue: value, metricStatus: status as MetricStatus, snapshot_day: day }
        if (existing >= 0) store.snapshots[existing] = row
        else store.snapshots.push(row)
      }
      return rows.length
    },
  }
  return store
}
