/**
 * Historical Instagram content-performance analysis from metric snapshots.
 * Descriptive only — no "winning format" claims without adequate sample size.
 */

import {
  getLatestSyncRun,
  listMetricSnapshots,
  listSyncedMedia,
} from '@/lib/jarvis/instagram/snapshots'
import { readInstagramBusinessAccountId } from '@/lib/jarvis/instagram/credentials'
import { remember } from '@/lib/jarvis/memory/business-memory'
import { writeInstagramAudit } from '@/lib/jarvis/instagram/audit'
import type { DataStatus } from '@/lib/jarvis/diagnostics/diagnostic-types'

const MIN_SAMPLE_FOR_FORMAT_CLAIM = 5

export type SnapshotRow = {
  media_id: string
  metric_name: string
  metric_value: number | string | null
  metric_status: string
  media_timestamp: string | null
  media_type: string | null
  media_product_type: string | null
  snapshot_day: string
  fetched_at: string
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function formatKey(mediaType: string | null, productType: string | null): string {
  const product = (productType || '').toUpperCase()
  const type = (mediaType || '').toUpperCase()
  if (product === 'REELS' || type === 'REELS') return 'REELS'
  if (type === 'CAROUSEL_ALBUM') return 'CAROUSEL'
  if (type === 'VIDEO') return 'VIDEO'
  if (type === 'IMAGE') return 'IMAGE'
  return type || product || 'UNKNOWN'
}

function postingBucket(iso: string | null): { day: string | null; hour: number | null } {
  if (!iso) return { day: null, hour: null }
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return { day: null, hour: null }
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(d)
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .find((p) => p.type === 'hour')?.value
  )
  return { day, hour: Number.isFinite(hour) ? hour : null }
}

function latestVerifiedByMedia(
  rows: SnapshotRow[],
  metricName: string
): Map<string, number> {
  const map = new Map<string, { value: number; fetched: string }>()
  for (const row of rows) {
    if (row.metric_name !== metricName) continue
    if (row.metric_status !== 'verified') continue
    if (row.media_id === '__account__') continue
    const value = num(row.metric_value)
    if (value === null) continue
    const prev = map.get(row.media_id)
    if (!prev || row.fetched_at > prev.fetched) {
      map.set(row.media_id, { value, fetched: row.fetched_at })
    }
  }
  return new Map([...map.entries()].map(([k, v]) => [k, v.value]))
}

export function calculatePerformanceFromSnapshots(input: {
  snapshots: SnapshotRow[]
  media: {
    media_id: string
    media_type: string | null
    media_product_type: string | null
    media_timestamp: string | null
    caption: string | null
  }[]
}): {
  data_status: DataStatus
  sample_size: number
  metrics_coverage: Record<string, { verified: number; unavailable: number; unsupported: number; failed: number }>
  rates: {
    engagement_rate: number | null
    interaction_rate: number | null
    reach_efficiency: number | null
    views_efficiency: number | null
    comment_rate: number | null
    save_rate: number | null
    note: string
  }
  posting_frequency: {
    posts_considered: number
    posts_with_timestamp: number
    avg_days_between_posts: number | null
    data_status: DataStatus
  }
  by_media_type: {
    format: string
    n: number
    median_reach: number | null
    median_views: number | null
    median_interactions: number | null
    median_likes: number | null
  }[]
  by_day: { day: string; n: number; median_reach: number | null }[]
  by_hour: { hour: number; n: number; median_reach: number | null }[]
  strongest_patterns: string[]
  weakest_patterns: string[]
  observations: string[]
  data_limitations: string[]
  memory_candidates: { title: string; summary: string; confidence: 'low' | 'medium' | 'high' }[]
} {
  const mediaMeta = new Map(
    input.media.map((m) => [
      m.media_id,
      m,
    ])
  )
  const coverage: Record<
    string,
    { verified: number; unavailable: number; unsupported: number; failed: number }
  > = {}
  for (const row of input.snapshots) {
    if (row.media_id === '__account__') continue
    if (!coverage[row.metric_name]) {
      coverage[row.metric_name] = { verified: 0, unavailable: 0, unsupported: 0, failed: 0 }
    }
    const bucket = coverage[row.metric_name]!
    if (row.metric_status === 'verified') bucket.verified += 1
    else if (row.metric_status === 'unsupported') bucket.unsupported += 1
    else if (row.metric_status === 'failed') bucket.failed += 1
    else bucket.unavailable += 1
  }

  const reach = latestVerifiedByMedia(input.snapshots, 'reach')
  const views = latestVerifiedByMedia(input.snapshots, 'views')
  const interactions = latestVerifiedByMedia(input.snapshots, 'total_interactions')
  const likes = latestVerifiedByMedia(input.snapshots, 'likes')
  const comments = latestVerifiedByMedia(input.snapshots, 'comments')
  const saves = latestVerifiedByMedia(input.snapshots, 'saved')

  const mediaIds = new Set<string>([
    ...reach.keys(),
    ...views.keys(),
    ...interactions.keys(),
    ...likes.keys(),
    ...input.media.map((m) => m.media_id),
  ])
  mediaIds.delete('__account__')
  const sample_size = mediaIds.size

  const engagementRates: number[] = []
  const interactionRates: number[] = []
  const reachEff: number[] = []
  const viewsEff: number[] = []
  const commentRates: number[] = []
  const saveRates: number[] = []

  for (const id of mediaIds) {
    const r = reach.get(id)
    const v = views.get(id)
    const i = interactions.get(id)
    const l = likes.get(id)
    const c = comments.get(id)
    const s = saves.get(id)
    if (r != null && r > 0 && i != null) interactionRates.push(i / r)
    if (r != null && r > 0 && l != null && c != null) engagementRates.push((l + c) / r)
    if (r != null && r > 0 && l != null) reachEff.push(l / r)
    if (v != null && v > 0 && i != null) viewsEff.push(i / v)
    if (r != null && r > 0 && c != null) commentRates.push(c / r)
    if (r != null && r > 0 && s != null) saveRates.push(s / r)
  }

  const timestamps = input.media
    .map((m) => m.media_timestamp)
    .filter((t): t is string => Boolean(t))
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)

  let avgDays: number | null = null
  if (timestamps.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push((timestamps[i]! - timestamps[i - 1]!) / 86_400_000)
    }
    avgDays = mean(gaps)
  }

  const byFormat = new Map<string, { reach: number[]; views: number[]; interactions: number[]; likes: number[] }>()
  for (const id of mediaIds) {
    const meta = mediaMeta.get(id)
    const key = formatKey(meta?.media_type ?? null, meta?.media_product_type ?? null)
    if (!byFormat.has(key)) byFormat.set(key, { reach: [], views: [], interactions: [], likes: [] })
    const bucket = byFormat.get(key)!
    const r = reach.get(id)
    const v = views.get(id)
    const i = interactions.get(id)
    const l = likes.get(id)
    if (r != null) bucket.reach.push(r)
    if (v != null) bucket.views.push(v)
    if (i != null) bucket.interactions.push(i)
    if (l != null) bucket.likes.push(l)
  }

  const by_media_type = [...byFormat.entries()].map(([format, vals]) => ({
    format,
    n: Math.max(vals.reach.length, vals.views.length, vals.interactions.length, vals.likes.length),
    median_reach: median(vals.reach),
    median_views: median(vals.views),
    median_interactions: median(vals.interactions),
    median_likes: median(vals.likes),
  }))

  const byDayMap = new Map<string, number[]>()
  const byHourMap = new Map<number, number[]>()
  for (const id of mediaIds) {
    const meta = mediaMeta.get(id)
    const r = reach.get(id)
    if (r == null) continue
    const bucket = postingBucket(meta?.media_timestamp ?? null)
    if (bucket.day) {
      if (!byDayMap.has(bucket.day)) byDayMap.set(bucket.day, [])
      byDayMap.get(bucket.day)!.push(r)
    }
    if (bucket.hour != null) {
      if (!byHourMap.has(bucket.hour)) byHourMap.set(bucket.hour, [])
      byHourMap.get(bucket.hour)!.push(r)
    }
  }

  const by_day = [...byDayMap.entries()].map(([day, vals]) => ({
    day,
    n: vals.length,
    median_reach: median(vals),
  }))
  const by_hour = [...byHourMap.entries()]
    .map(([hour, vals]) => ({ hour, n: vals.length, median_reach: median(vals) }))
    .sort((a, b) => a.hour - b.hour)

  const data_limitations: string[] = [
    'Analysis uses stored Instagram Login snapshots only — not Meta ads.',
    'Topic/category is not invented; marketing_content topics are not joined unless explicitly present.',
    `Format comparisons require at least ${MIN_SAMPLE_FOR_FORMAT_CLAIM} posts per format before calling a pattern strong.`,
  ]
  if (sample_size === 0) {
    data_limitations.push('No synced media metrics available. Run instagram.sync_content first.')
  }

  const strongest_patterns: string[] = []
  const weakest_patterns: string[] = []
  const observations: string[] = []
  const memory_candidates: {
    title: string
    summary: string
    confidence: 'low' | 'medium' | 'high'
  }[] = []

  const formatsWithReach = by_media_type.filter(
    (f) => f.median_reach != null && f.n >= MIN_SAMPLE_FOR_FORMAT_CLAIM
  )
  if (formatsWithReach.length >= 2) {
    const ranked = [...formatsWithReach].sort(
      (a, b) => (b.median_reach ?? 0) - (a.median_reach ?? 0)
    )
    const top = ranked[0]!
    const bottom = ranked[ranked.length - 1]!
    if (top.format !== bottom.format && top.median_reach != null && bottom.median_reach != null) {
      const summary = `In the available sample, ${top.format} posts had higher median reach (${top.median_reach.toFixed(0)}, n=${top.n}) than ${bottom.format} (${bottom.median_reach.toFixed(0)}, n=${bottom.n}).`
      strongest_patterns.push(summary)
      weakest_patterns.push(
        `${bottom.format} showed lower median reach than ${top.format} in this sample (not a universal rule).`
      )
      memory_candidates.push({
        title: `Instagram sample: ${top.format} vs ${bottom.format} reach`,
        summary,
        confidence: top.n >= 8 && bottom.n >= 8 ? 'medium' : 'low',
      })
    }
  } else {
    observations.push(
      `Not enough posts per format (need ≥${MIN_SAMPLE_FOR_FORMAT_CLAIM}) to claim a stronger format.`
    )
  }

  const daysReady = by_day.filter((d) => d.n >= 3 && d.median_reach != null)
  if (daysReady.length >= 2) {
    const ranked = [...daysReady].sort((a, b) => (b.median_reach ?? 0) - (a.median_reach ?? 0))
    observations.push(
      `Among days with ≥3 posts, ${ranked[0]!.day} had the highest median reach in this sample (n=${ranked[0]!.n}).`
    )
  }

  if (interactionRates.length) {
    observations.push(
      `Median interaction rate (interactions/reach) across ${interactionRates.length} posts with both metrics: ${((median(interactionRates) ?? 0) * 100).toFixed(2)}%.`
    )
  }

  const data_status: DataStatus =
    sample_size === 0
      ? 'unavailable'
      : reach.size || views.size || interactions.size
        ? 'verified'
        : 'partial'

  return {
    data_status,
    sample_size,
    metrics_coverage: coverage,
    rates: {
      engagement_rate: median(engagementRates),
      interaction_rate: median(interactionRates),
      reach_efficiency: median(reachEff),
      views_efficiency: median(viewsEff),
      comment_rate: median(commentRates),
      save_rate: median(saveRates),
      note: 'Rates use median of per-post ratios where both numerator and denominator were verified. Null when insufficient data.',
    },
    posting_frequency: {
      posts_considered: input.media.length,
      posts_with_timestamp: timestamps.length,
      avg_days_between_posts: avgDays,
      data_status: timestamps.length >= 2 ? 'verified' : timestamps.length ? 'partial' : 'unavailable',
    },
    by_media_type,
    by_day,
    by_hour,
    strongest_patterns,
    weakest_patterns,
    observations,
    data_limitations,
    memory_candidates,
  }
}

export async function analyzeInstagramPerformance(input?: {
  days?: number
  limit?: number
  actorId?: string | null
  writeMemory?: boolean
  igAccountId?: string
}): Promise<{
  source: string
  data_status: DataStatus
  retrieved_at: string
  period: { label: string; days: number }
  timezone: string
  value: ReturnType<typeof calculatePerformanceFromSnapshots> & {
    latest_sync: Record<string, unknown> | null
    followers_latest: number | null
  } | null
  note: string
  memory_written: number
  error?: string
}> {
  const retrieved_at = new Date().toISOString()
  const days = input?.days ?? 30
  const igAccountId = input?.igAccountId || readInstagramBusinessAccountId()
  if (!igAccountId) {
    return {
      source: 'instagram.analyze_performance',
      data_status: 'unavailable',
      retrieved_at,
      period: { label: 'historical_snapshots', days },
      timezone: 'Asia/Kolkata',
      value: null,
      note: 'INSTAGRAM_BUSINESS_ACCOUNT_ID not configured.',
      memory_written: 0,
      error: 'not_configured',
    }
  }

  try {
    const [media, snapshots, latestSync] = await Promise.all([
      listSyncedMedia(igAccountId, input?.limit ?? 50),
      listMetricSnapshots({
        igAccountId,
        days,
        limit: 3000,
      }),
      getLatestSyncRun(igAccountId),
    ])

    const analysis = calculatePerformanceFromSnapshots({
      snapshots: snapshots as SnapshotRow[],
      media: media.map((m) => ({
        media_id: String(m.media_id),
        media_type: (m.media_type as string | null) ?? null,
        media_product_type: (m.media_product_type as string | null) ?? null,
        media_timestamp: (m.media_timestamp as string | null) ?? null,
        caption: (m.caption as string | null) ?? null,
      })),
    })

    const accountFollowers = (snapshots as SnapshotRow[])
      .filter(
        (s) =>
          s.media_id === '__account__' &&
          s.metric_name === 'followers_count' &&
          s.metric_status === 'verified'
      )
      .sort((a, b) => (a.fetched_at < b.fetched_at ? 1 : -1))
    const followers_latest = num(accountFollowers[0]?.metric_value ?? null)

    let memory_written = 0
    if (input?.writeMemory !== false) {
      for (const candidate of analysis.memory_candidates.slice(0, 3)) {
        await remember({
          category: 'insight',
          title: candidate.title,
          summary: candidate.summary,
          confidence: candidate.confidence,
          tags: ['instagram', 'content_intelligence', 'organic'],
          details: {
            sample_size: analysis.sample_size,
            days,
            source: 'instagram.analyze_performance',
          },
          actorId: input?.actorId ?? null,
          source: 'instagram.analyze_performance',
        })
        memory_written += 1
      }
    }

    await writeInstagramAudit({
      action: 'instagram.analyze_performance',
      target: igAccountId,
      actor: input?.actorId ?? 'jarvis',
      approval_state: 'not_required_read_only',
      result: 'ok',
      provider_response_status: null,
      extra: {
        sample_size: analysis.sample_size,
        memory_written,
        data_status: analysis.data_status,
      },
    })

    return {
      source: 'instagram.analyze_performance',
      data_status: analysis.data_status,
      retrieved_at,
      period: { label: 'historical_snapshots', days },
      timezone: 'Asia/Kolkata',
      value: {
        ...analysis,
        latest_sync: latestSync
          ? {
              id: latestSync.id,
              status: latestSync.status,
              started_at: latestSync.started_at,
              completed_at: latestSync.completed_at,
              media_fetched: latestSync.media_fetched,
              insights_fetched: latestSync.insights_fetched,
              snapshots_upserted: latestSync.snapshots_upserted,
            }
          : null,
        followers_latest,
      },
      note:
        analysis.sample_size === 0
          ? 'No historical snapshots yet. Run instagram.sync_content (read-only) first.'
          : `Analyzed ${analysis.sample_size} synced media item(s) over ~${days} days.`,
      memory_written,
    }
  } catch (err) {
    return {
      source: 'instagram.analyze_performance',
      data_status: 'failed',
      retrieved_at,
      period: { label: 'historical_snapshots', days },
      timezone: 'Asia/Kolkata',
      value: null,
      note: 'Failed to analyze stored Instagram snapshots.',
      memory_written: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function getInstagramIntelligenceSummary(igAccountId?: string) {
  const accountId = igAccountId || readInstagramBusinessAccountId()
  if (!accountId) {
    return {
      configured: false,
      followers: null as number | null,
      posts_synced: null as number | null,
      latest_sync_at: null as string | null,
      latest_sync_status: null as string | null,
      reach_median: null as number | null,
      interactions_median: null as number | null,
      data_coverage_note: 'Instagram account id not configured.',
    }
  }
  const [media, snapshots, latest] = await Promise.all([
    listSyncedMedia(accountId, 50),
    listMetricSnapshots({ igAccountId: accountId, days: 14, limit: 1500 }),
    getLatestSyncRun(accountId),
  ])
  const analysis = calculatePerformanceFromSnapshots({
    snapshots: snapshots as SnapshotRow[],
    media: media.map((m) => ({
      media_id: String(m.media_id),
      media_type: (m.media_type as string | null) ?? null,
      media_product_type: (m.media_product_type as string | null) ?? null,
      media_timestamp: (m.media_timestamp as string | null) ?? null,
      caption: (m.caption as string | null) ?? null,
    })),
  })
  const followersRow = (snapshots as SnapshotRow[])
    .filter(
      (s) =>
        s.media_id === '__account__' &&
        s.metric_name === 'followers_count' &&
        s.metric_status === 'verified'
    )
    .sort((a, b) => (a.fetched_at < b.fetched_at ? 1 : -1))[0]
  const reachVals = [...latestVerifiedByMedia(snapshots as SnapshotRow[], 'reach').values()]
  const interactionVals = [
    ...latestVerifiedByMedia(snapshots as SnapshotRow[], 'total_interactions').values(),
  ]
  return {
    configured: true,
    followers: num(followersRow?.metric_value ?? null),
    posts_synced: media.length,
    latest_sync_at: (latest?.completed_at || latest?.started_at || null) as string | null,
    latest_sync_status: (latest?.status as string | null) ?? null,
    reach_median: median(reachVals),
    interactions_median: median(interactionVals),
    data_coverage_note:
      analysis.sample_size === 0
        ? 'No sync snapshots yet.'
        : `${analysis.sample_size} media with metrics in last 14 days.`,
    rates: analysis.rates,
    by_media_type: analysis.by_media_type,
  }
}
