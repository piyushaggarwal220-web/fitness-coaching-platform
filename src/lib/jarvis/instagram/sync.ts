/**
 * Bounded Instagram Content Intelligence sync (READ-ONLY).
 * Instagram Login Graph → media catalog + daily metric snapshots.
 * Never publishes. Never fabricates unsupported metrics.
 */

import { randomUUID } from 'crypto'
import {
  getInstagramProfile,
  listInstagramMedia,
  getInstagramMediaInsights,
  type InstagramProviderOptions,
} from '@/lib/jarvis/instagram/provider'
import {
  createSyncRun,
  completeSyncRun,
  upsertInstagramMedia,
  upsertMetricSnapshots,
  type MetricStatus,
  type InstagramMetricSnapshotInput,
  type SnapshotTestStore,
} from '@/lib/jarvis/instagram/snapshots'
import {
  isInstagramConfigured,
  liveInstagramPublishingEnabled,
  readInstagramBusinessAccountId,
} from '@/lib/jarvis/instagram/credentials'
import { writeInstagramAudit } from '@/lib/jarvis/instagram/audit'
import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { redactSecrets } from '@/lib/jarvis/operator-errors'
import type { InstagramMediaItem } from '@/lib/jarvis/instagram/types'

export const INSTAGRAM_SYNC_DEFAULT_MEDIA_LIMIT = 12
export const INSTAGRAM_SYNC_MAX_MEDIA_LIMIT = 25
/** Profile + media list + per-item insights — hard ceiling. */
export const INSTAGRAM_SYNC_MAX_API_CALLS = 40

const ACCOUNT_MEDIA_ID = '__account__'

function insightsMetricsFor(media: InstagramMediaItem): string[] {
  const product = (media.media_product_type || '').toUpperCase()
  const type = (media.media_type || '').toUpperCase()
  if (product === 'REELS' || type === 'REELS' || type === 'VIDEO') {
    return ['reach', 'saved', 'shares', 'views', 'total_interactions']
  }
  return ['reach', 'saved', 'total_interactions']
}

function countStatus(value: number | null): MetricStatus {
  return value == null ? 'unavailable' : 'verified'
}

export type InstagramSyncDeps = {
  getProfile?: typeof getInstagramProfile
  listMedia?: typeof listInstagramMedia
  getInsights?: typeof getInstagramMediaInsights
  createRun?: typeof createSyncRun
  completeRun?: typeof completeSyncRun
  upsertMedia?: typeof upsertInstagramMedia
  upsertSnapshots?: typeof upsertMetricSnapshots
  assertBudget?: typeof assertAiBudgetAvailable
  now?: () => Date
  /** Test-only memory store (skips Supabase when provided via upsert overrides). */
  testStore?: SnapshotTestStore
}

export type InstagramSyncResult = {
  ok: boolean
  source: 'instagram.sync_content'
  data_status: 'verified' | 'partial' | 'unavailable' | 'failed'
  retrieved_at: string
  live_publishing_enabled: boolean
  sync_run_id: string | null
  ig_account_id: string | null
  username: string | null
  media_fetched: number
  insights_fetched: number
  snapshots_upserted: number
  api_calls: number
  duplicates_avoided_via_daily_upsert: true
  profile: {
    followers_count: number | null
    follows_count: number | null
    media_count: number | null
  } | null
  limitations: string[]
  note: string
  error?: string
  error_code?: string | null
}

export async function syncInstagramContent(input?: {
  mediaLimit?: number
  actorId?: string | null
  providerOpts?: InstagramProviderOptions
  skipBudgetCheck?: boolean
  deps?: InstagramSyncDeps
}): Promise<InstagramSyncResult> {
  const retrieved_at = (input?.deps?.now?.() ?? new Date()).toISOString()
  const live = liveInstagramPublishingEnabled()
  const limitations: string[] = [
    'Read-only sync. Publishing is not performed.',
    'LIVE_INSTAGRAM_PUBLISHING_ENABLED is not modified.',
    'Unsupported insight metrics are recorded as unavailable/unsupported — never fabricated as zero.',
  ]

  if (live) {
    limitations.push(
      'LIVE_INSTAGRAM_PUBLISHING_ENABLED is true in env, but sync_content remains read-only.'
    )
  }

  const mediaLimit = Math.min(
    INSTAGRAM_SYNC_MAX_MEDIA_LIMIT,
    Math.max(1, input?.mediaLimit ?? INSTAGRAM_SYNC_DEFAULT_MEDIA_LIMIT)
  )

  if (!input?.providerOpts?.transport && !isInstagramConfigured()) {
    return {
      ok: false,
      source: 'instagram.sync_content',
      data_status: 'unavailable',
      retrieved_at,
      live_publishing_enabled: live,
      sync_run_id: null,
      ig_account_id: null,
      username: null,
      media_fetched: 0,
      insights_fetched: 0,
      snapshots_upserted: 0,
      api_calls: 0,
      duplicates_avoided_via_daily_upsert: true,
      profile: null,
      limitations,
      note: 'Instagram Login not configured. Sync unavailable.',
      error: 'not_configured',
      error_code: 'CONFIG_ERROR',
    }
  }

  const assertBudget = input?.deps?.assertBudget ?? assertAiBudgetAvailable
  if (!input?.skipBudgetCheck) {
    const gate = await assertBudget(0.05)
    if (!gate.ok) {
      await writeInstagramAudit({
        action: 'instagram.sync_content',
        target: readInstagramBusinessAccountId() || null,
        actor: input?.actorId ?? 'jarvis',
        approval_state: 'not_required_read_only',
        result: 'budget_exhausted',
        provider_response_status: null,
        error_redacted: gate.reason,
      })
      return {
        ok: false,
        source: 'instagram.sync_content',
        data_status: 'unavailable',
        retrieved_at,
        live_publishing_enabled: live,
        sync_run_id: null,
        ig_account_id: readInstagramBusinessAccountId() || null,
        username: null,
        media_fetched: 0,
        insights_fetched: 0,
        snapshots_upserted: 0,
        api_calls: 0,
        duplicates_avoided_via_daily_upsert: true,
        profile: null,
        limitations,
        note: gate.reason,
        error: gate.reason,
        error_code: 'budget_exhausted',
      }
    }
  }

  const igAccountId =
    input?.providerOpts?.credentials?.igUserId ||
    readInstagramBusinessAccountId() ||
    'unknown'

  const createRun = input?.deps?.createRun ?? createSyncRun
  const run = await createRun({ igAccountId, mediaLimit })
  if ('error' in run) {
    return {
      ok: false,
      source: 'instagram.sync_content',
      data_status: 'failed',
      retrieved_at,
      live_publishing_enabled: live,
      sync_run_id: null,
      ig_account_id: igAccountId,
      username: null,
      media_fetched: 0,
      insights_fetched: 0,
      snapshots_upserted: 0,
      api_calls: 0,
      duplicates_avoided_via_daily_upsert: true,
      profile: null,
      limitations,
      note: 'Failed to open sync run record.',
      error: run.error,
      error_code: 'persist_error',
    }
  }

  const syncRunId = run.id
  const getProfile = input?.deps?.getProfile ?? getInstagramProfile
  const listMedia = input?.deps?.listMedia ?? listInstagramMedia
  const getInsights = input?.deps?.getInsights ?? getInstagramMediaInsights
  const upsertMedia = input?.deps?.upsertMedia ?? upsertInstagramMedia
  const upsertSnapshots = input?.deps?.upsertSnapshots ?? upsertMetricSnapshots
  const completeRun = input?.deps?.completeRun ?? completeSyncRun

  let apiCalls = 0
  let mediaFetched = 0
  let insightsFetched = 0
  let snapshotsUpserted = 0
  let username: string | null = null
  let profileOut: InstagramSyncResult['profile'] = null
  let rateLimited = false
  let partial = false
  const snapshotBuf: InstagramMetricSnapshotInput[] = []

  try {
    const profile = await getProfile({
      ...input?.providerOpts,
      actorId: input?.actorId,
    })
    apiCalls += 1

    if (profile.data_status === 'failed' || profile.data_status === 'unavailable') {
      if (profile.error_code === 'rate_limit') rateLimited = true
      await completeRun({
        id: syncRunId,
        status: rateLimited ? 'rate_limited' : 'failed',
        mediaFetched: 0,
        insightsFetched: 0,
        snapshotsUpserted: 0,
        apiCalls,
        errorRedacted: profile.error ?? profile.note ?? null,
        summary: { stage: 'profile', data_status: profile.data_status },
      })
      await writeInstagramAudit({
        action: 'instagram.sync_content',
        target: igAccountId,
        actor: input?.actorId ?? 'jarvis',
        approval_state: 'not_required_read_only',
        result: 'failed',
        provider_response_status: profile.provider_status ?? null,
        error_redacted: profile.error ?? null,
      })
      return {
        ok: false,
        source: 'instagram.sync_content',
        data_status: 'failed',
        retrieved_at,
        live_publishing_enabled: live,
        sync_run_id: syncRunId,
        ig_account_id: igAccountId,
        username: null,
        media_fetched: 0,
        insights_fetched: 0,
        snapshots_upserted: 0,
        api_calls: apiCalls,
        duplicates_avoided_via_daily_upsert: true,
        profile: null,
        limitations,
        note: profile.note || 'Profile sync failed.',
        error: profile.error,
        error_code: profile.error_code ?? 'API_ERROR',
      }
    }

    username = profile.value?.username ?? null
    // Always key history by configured INSTAGRAM_BUSINESS_ACCOUNT_ID when present.
    // Instagram Login may return a different app-scoped profile.id — keep it in metadata only.
    const configuredId = readInstagramBusinessAccountId()
    const accountId = configuredId || profile.value?.id || igAccountId
    const graphProfileId = profile.value?.id ?? null
    profileOut = {
      followers_count: profile.value?.followers_count ?? null,
      follows_count: profile.value?.follows_count ?? null,
      media_count: profile.value?.media_count ?? null,
    }

    const accountMetrics: { name: string; value: number | null }[] = [
      { name: 'followers_count', value: profile.value?.followers_count ?? null },
      { name: 'follows_count', value: profile.value?.follows_count ?? null },
      { name: 'media_count', value: profile.value?.media_count ?? null },
    ]
    for (const m of accountMetrics) {
      snapshotBuf.push({
        igAccountId: accountId,
        mediaId: ACCOUNT_MEDIA_ID,
        mediaTimestamp: null,
        metricName: m.name,
        metricValue: m.value,
        metricStatus: countStatus(m.value),
        fetchedAt: retrieved_at,
        syncRunId,
      })
    }

    if (apiCalls >= INSTAGRAM_SYNC_MAX_API_CALLS) {
      throw new Error('API call budget exhausted before media list')
    }

    const media = await listMedia(
      { limit: mediaLimit },
      { ...input?.providerOpts, actorId: input?.actorId }
    )
    apiCalls += 1

    if (media.data_status === 'failed' || media.data_status === 'unavailable') {
      if (media.error_code === 'rate_limit') rateLimited = true
      partial = true
      const snap = await upsertSnapshots(snapshotBuf)
      snapshotsUpserted += snap.upserted
      await completeRun({
        id: syncRunId,
        status: rateLimited ? 'rate_limited' : 'partial',
        mediaFetched: 0,
        insightsFetched: 0,
        snapshotsUpserted,
        apiCalls,
        errorRedacted: media.error ?? null,
        summary: { stage: 'media_list', profile_ok: true },
      })
      return {
        ok: true,
        source: 'instagram.sync_content',
        data_status: 'partial',
        retrieved_at,
        live_publishing_enabled: live,
        sync_run_id: syncRunId,
        ig_account_id: accountId,
        username,
        media_fetched: 0,
        insights_fetched: 0,
        snapshots_upserted: snapshotsUpserted,
        api_calls: apiCalls,
        duplicates_avoided_via_daily_upsert: true,
        profile: profileOut,
        limitations: [...limitations, 'Media list failed; account metrics may still be stored.'],
        note: media.note || 'Media list failed.',
        error: media.error,
        error_code: media.error_code ?? 'API_ERROR',
      }
    }

    const items = media.value ?? []
    mediaFetched = items.length

    await upsertMedia(
      items.map((item) => ({
        igAccountId: accountId,
        mediaId: item.id,
        username,
        caption: item.caption,
        permalink: item.permalink,
        mediaType: item.media_type,
        mediaProductType: item.media_product_type,
        mediaTimestamp: item.timestamp,
        likeCount: item.like_count,
        likeCountStatus: countStatus(item.like_count),
        commentsCount: item.comments_count,
        commentsCountStatus: countStatus(item.comments_count),
        syncRunId,
        metadata: {
          graph_profile_id: graphProfileId,
          configured_ig_account_id: configuredId || null,
        },
      }))
    )

    for (const item of items) {
      // Persist surface metrics from media object
      for (const [name, value] of [
        ['likes', item.like_count],
        ['comments', item.comments_count],
      ] as const) {
        snapshotBuf.push({
          igAccountId: accountId,
          mediaId: item.id,
          mediaTimestamp: item.timestamp,
          metricName: name,
          metricValue: value,
          metricStatus: countStatus(value),
          fetchedAt: retrieved_at,
          mediaType: item.media_type,
          mediaProductType: item.media_product_type,
          syncRunId,
        })
      }

      if (apiCalls >= INSTAGRAM_SYNC_MAX_API_CALLS) {
        partial = true
        limitations.push('Stopped insights early — API call budget reached.')
        break
      }

      const metrics = insightsMetricsFor(item)
      const insights = await getInsights(item.id, metrics, {
        ...input?.providerOpts,
        actorId: input?.actorId,
      })
      apiCalls += 1

      if (insights.data_status === 'verified' || insights.data_status === 'partial') {
        insightsFetched += 1
        const returned = new Map(
          (insights.value ?? []).map((row) => [
            row.name,
            {
              value: row.values?.[0]?.value ?? null,
              period: row.period,
            },
          ])
        )
        for (const name of metrics) {
          if (returned.has(name)) {
            const row = returned.get(name)!
            snapshotBuf.push({
              igAccountId: accountId,
              mediaId: item.id,
              mediaTimestamp: item.timestamp,
              metricName: name,
              metricValue: row.value,
              metricStatus: countStatus(row.value),
              fetchedAt: retrieved_at,
              mediaType: item.media_type,
              mediaProductType: item.media_product_type,
              syncRunId,
              providerPeriod: row.period,
            })
          } else {
            snapshotBuf.push({
              igAccountId: accountId,
              mediaId: item.id,
              mediaTimestamp: item.timestamp,
              metricName: name,
              metricValue: null,
              metricStatus: 'unavailable',
              fetchedAt: retrieved_at,
              mediaType: item.media_type,
              mediaProductType: item.media_product_type,
              syncRunId,
            })
          }
        }
      } else if (insights.error_code === 'rate_limit') {
        rateLimited = true
        partial = true
        for (const name of metrics) {
          snapshotBuf.push({
            igAccountId: accountId,
            mediaId: item.id,
            mediaTimestamp: item.timestamp,
            metricName: name,
            metricValue: null,
            metricStatus: 'failed',
            fetchedAt: retrieved_at,
            mediaType: item.media_type,
            mediaProductType: item.media_product_type,
            syncRunId,
            errorRedacted: insights.error ?? 'rate_limit',
          })
        }
        limitations.push('Rate limited while fetching insights; remaining items skipped.')
        break
      } else {
        partial = true
        const status: MetricStatus =
          /does not support|must be one of|unsupported/i.test(insights.error || '')
            ? 'unsupported'
            : 'failed'
        for (const name of metrics) {
          snapshotBuf.push({
            igAccountId: accountId,
            mediaId: item.id,
            mediaTimestamp: item.timestamp,
            metricName: name,
            metricValue: null,
            metricStatus: status,
            fetchedAt: retrieved_at,
            mediaType: item.media_type,
            mediaProductType: item.media_product_type,
            syncRunId,
            errorRedacted: insights.error ? redactSecrets(insights.error).slice(0, 200) : null,
          })
        }
      }
    }

    const snap = await upsertSnapshots(snapshotBuf)
    snapshotsUpserted += snap.upserted

    const status = rateLimited
      ? 'rate_limited'
      : partial
        ? 'partial'
        : 'completed'

    await completeRun({
      id: syncRunId,
      status,
      mediaFetched,
      insightsFetched,
      snapshotsUpserted,
      apiCalls,
      summary: {
        username,
        media_limit: mediaLimit,
        profile: profileOut,
        graph_profile_id: graphProfileId,
        configured_ig_account_id: configuredId || null,
      },
    })

    await writeInstagramAudit({
      action: 'instagram.sync_content',
      target: accountId,
      actor: input?.actorId ?? 'jarvis',
      approval_state: 'not_required_read_only',
      result: status,
      provider_response_status: 200,
      extra: {
        sync_run_id: syncRunId,
        media_fetched: mediaFetched,
        insights_fetched: insightsFetched,
        snapshots_upserted: snapshotsUpserted,
        api_calls: apiCalls,
        live_publishing_enabled: live,
      },
    })

    return {
      ok: true,
      source: 'instagram.sync_content',
      data_status: partial || rateLimited ? 'partial' : 'verified',
      retrieved_at,
      live_publishing_enabled: live,
      sync_run_id: syncRunId,
      ig_account_id: accountId,
      username,
      media_fetched: mediaFetched,
      insights_fetched: insightsFetched,
      snapshots_upserted: snapshotsUpserted,
      api_calls: apiCalls,
      duplicates_avoided_via_daily_upsert: true,
      profile: profileOut,
      limitations,
      note: `Synced ${mediaFetched} media item(s); ${snapshotsUpserted} metric snapshot row(s) upserted for IST day (idempotent).`,
    }
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 300)
    try {
      if (snapshotBuf.length) {
        const snap = await upsertSnapshots(snapshotBuf)
        snapshotsUpserted += snap.upserted
      }
    } catch {
      /* ignore secondary persist errors */
    }
    await completeRun({
      id: syncRunId,
      status: 'failed',
      mediaFetched,
      insightsFetched,
      snapshotsUpserted,
      apiCalls,
      errorRedacted: message,
    })
    await writeInstagramAudit({
      action: 'instagram.sync_content',
      target: igAccountId,
      actor: input?.actorId ?? 'jarvis',
      approval_state: 'not_required_read_only',
      result: 'failed',
      provider_response_status: null,
      error_redacted: message,
    })
    return {
      ok: false,
      source: 'instagram.sync_content',
      data_status: 'failed',
      retrieved_at,
      live_publishing_enabled: live,
      sync_run_id: syncRunId,
      ig_account_id: igAccountId,
      username,
      media_fetched: mediaFetched,
      insights_fetched: insightsFetched,
      snapshots_upserted: snapshotsUpserted,
      api_calls: apiCalls,
      duplicates_avoided_via_daily_upsert: true,
      profile: profileOut,
      limitations,
      note: 'Instagram sync failed.',
      error: message,
      error_code: 'API_ERROR',
    }
  }
}

/** Test helper: sync using an in-memory snapshot store + injected transports. */
export async function syncInstagramContentForTests(
  input: Parameters<typeof syncInstagramContent>[0] & {
    memory: ReturnType<typeof import('@/lib/jarvis/instagram/snapshots').createMemorySnapshotStore>
  }
) {
  const memory = input.memory
  const runId = randomUUID()
  memory.syncRuns.push({ id: runId, status: 'running', snapshots_upserted: 0 })
  return syncInstagramContent({
    ...input,
    skipBudgetCheck: true,
    deps: {
      ...input.deps,
      createRun: async () => ({ id: runId }),
      completeRun: async (r) => {
        const row = memory.syncRuns.find((s) => s.id === r.id)
        if (row) {
          row.status = r.status
          row.snapshots_upserted = r.snapshotsUpserted
        }
      },
      upsertMedia: async (rows) => ({ upserted: memory.upsertMedia(rows) }),
      upsertSnapshots: async (rows) => ({ upserted: memory.upsertSnapshots(rows) }),
      assertBudget: async () =>
        ({
          ok: true,
          dailySpent: 0,
          dailyLimit: 10,
          remaining: 10,
        }) as Awaited<ReturnType<typeof assertAiBudgetAvailable>>,
    },
  })
}
