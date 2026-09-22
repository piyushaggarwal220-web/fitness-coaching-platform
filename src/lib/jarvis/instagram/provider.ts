/**
 * Instagram Graph provider for Jarvis (Instagram Login → graph.instagram.com).
 * Uses INSTAGRAM_ACCESS_TOKEN only — never META_ADS_ACCESS_TOKEN.
 * Failure honesty: never convert unavailable/failed into numeric zero.
 */

import { MetaApiError } from '@/lib/ai-marketing/meta/client'
import { createInstagramGraphClient } from '@/lib/jarvis/instagram/client'
import { metricProvenance } from '@/lib/jarvis/diagnostics/provenance'
import type { DataStatus } from '@/lib/jarvis/diagnostics/diagnostic-types'
import { redactSecrets } from '@/lib/jarvis/operator-errors'
import {
  getInstagramCredentials,
  isInstagramConfigured,
  resolveInstagramCredentials,
  type InstagramResolvedCredentials,
} from '@/lib/jarvis/instagram/credentials'
import type {
  InstagramInsightMetric,
  InstagramMediaItem,
  InstagramMetricEnvelope,
  InstagramProfile,
} from '@/lib/jarvis/instagram/types'
import { writeInstagramAudit } from '@/lib/jarvis/instagram/audit'

export type InstagramTransport = {
  get: <T = unknown>(path: string, query?: Record<string, string>) => Promise<T>
  post: <T = unknown>(path: string, body?: Record<string, unknown>) => Promise<T>
}

export type InstagramProviderOptions = {
  transport?: InstagramTransport
  credentials?: InstagramResolvedCredentials
  now?: () => Date
  actorId?: string | null
  skipAudit?: boolean
}

const PROFILE_FIELDS =
  'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,account_type'

const MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count'

function nowIso(opts?: InstagramProviderOptions): string {
  return (opts?.now?.() ?? new Date()).toISOString()
}

function redactError(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : String(err)).slice(0, 400)
}

function classifyProviderError(err: unknown): {
  data_status: DataStatus
  error_code: string
  provider_status: number | null
  note: string
} {
  if (err instanceof MetaApiError) {
    const status = err.status ?? null
    const body = err.body as { code?: number; message?: string } | undefined
    const code = body?.code
    if (status === 429 || code === 4 || code === 17 || code === 32) {
      return {
        data_status: 'failed',
        error_code: 'rate_limit',
        provider_status: status,
        note: 'Instagram Graph rate-limited the request. Missing data is not zero.',
      }
    }
    if (status === 401 || status === 403 || code === 10 || code === 190 || code === 200) {
      return {
        data_status: 'failed',
        error_code: 'permission',
        provider_status: status,
        note: 'Instagram Graph permission/auth failure. Missing data is not zero.',
      }
    }
    if (status === 408) {
      return {
        data_status: 'failed',
        error_code: 'timeout',
        provider_status: status,
        note: 'Instagram Graph timed out. Missing data is not zero.',
      }
    }
    return {
      data_status: 'failed',
      error_code: 'api_error',
      provider_status: status,
      note: 'Instagram Graph API error. Missing data is not zero.',
    }
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (/malformed|unexpected|cannot parse|missing .* array|refusing/i.test(msg)) {
    return {
      data_status: 'failed',
      error_code: 'malformed_response',
      provider_status: null,
      note: 'Instagram Graph returned a malformed payload. Missing data is not zero.',
    }
  }
  return {
    data_status: 'failed',
    error_code: 'unknown',
    provider_status: null,
    note: 'Instagram provider failed. Missing data is not zero.',
  }
}

function unavailableEnvelope<T>(
  source: string,
  retrieved_at: string,
  note: string
): InstagramMetricEnvelope<T> {
  return {
    source,
    data_status: 'unavailable',
    retrieved_at,
    period: null,
    timezone: null,
    value: null,
    note,
    error: note,
    error_code: 'not_configured',
    provider_status: null,
    provenance: metricProvenance({
      metric: source,
      value: null,
      timezone: 'UTC',
      source,
      data_status: 'unavailable',
      calculation_method: 'none — Instagram Graph not configured',
      note,
      source_timestamp: retrieved_at,
    }),
  }
}

function failedEnvelope<T>(
  source: string,
  retrieved_at: string,
  err: unknown
): InstagramMetricEnvelope<T> {
  const classified = classifyProviderError(err)
  const error = redactError(err)
  return {
    source,
    data_status: classified.data_status,
    retrieved_at,
    period: null,
    timezone: null,
    value: null,
    note: classified.note,
    error,
    error_code: classified.error_code,
    provider_status: classified.provider_status,
    provenance: metricProvenance({
      metric: source,
      value: null,
      timezone: 'UTC',
      source,
      data_status: classified.data_status,
      calculation_method: 'none — provider failure',
      note: classified.note,
      source_timestamp: retrieved_at,
    }),
  }
}

async function getTransport(
  opts?: InstagramProviderOptions
): Promise<
  | { ok: true; transport: InstagramTransport; credentials: InstagramResolvedCredentials }
  | { ok: false; missing: string[] }
> {
  if (opts?.transport && opts?.credentials) {
    return { ok: true, transport: opts.transport, credentials: opts.credentials }
  }
  const resolved = resolveInstagramCredentials()
  if (!resolved.ok) return resolved
  if (opts?.transport) {
    return { ok: true, transport: opts.transport, credentials: resolved.credentials }
  }
  const client = createInstagramGraphClient({
    accessToken: resolved.credentials.accessToken,
    apiVersion: resolved.credentials.apiVersion,
  })
  return { ok: true, transport: client, credentials: resolved.credentials }
}

/**
 * Resolve IG professional account id.
 * Instagram Login: prefer INSTAGRAM_BUSINESS_ACCOUNT_ID; else GET /me?fields=user_id.
 * Does not use Facebook Page resolve (requires Facebook Login + graph.facebook.com).
 */
async function resolveIgUserId(
  transport: InstagramTransport,
  credentials: InstagramResolvedCredentials
): Promise<string> {
  if (credentials.igUserId) return credentials.igUserId

  const me = await transport.get<{ user_id?: string; id?: string }>('/me', {
    fields: 'user_id,username',
  })
  const id = me?.user_id || (typeof me?.id === 'string' ? me.id : null)
  if (!id) {
    throw new MetaApiError(
      'Could not resolve Instagram user id from /me. Set INSTAGRAM_BUSINESS_ACCOUNT_ID.',
      404,
      { code: 404, message: 'instagram user_id missing' }
    )
  }
  return String(id)
}

function parseOptionalNumber(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function mapMediaItem(raw: Record<string, unknown>): InstagramMediaItem {
  return {
    id: String(raw.id ?? ''),
    caption: typeof raw.caption === 'string' ? raw.caption : null,
    media_type: typeof raw.media_type === 'string' ? raw.media_type : null,
    media_product_type:
      typeof raw.media_product_type === 'string' ? raw.media_product_type : null,
    media_url: typeof raw.media_url === 'string' ? raw.media_url : null,
    permalink: typeof raw.permalink === 'string' ? raw.permalink : null,
    thumbnail_url: typeof raw.thumbnail_url === 'string' ? raw.thumbnail_url : null,
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : null,
    like_count: parseOptionalNumber(raw.like_count),
    comments_count: parseOptionalNumber(raw.comments_count),
  }
}

async function auditAction(
  opts: InstagramProviderOptions | undefined,
  input: {
    action: string
    target: string | null
    result: string
    provider_status: number | null
    error?: string | null
    approval_state?: string | null
  }
) {
  if (opts?.skipAudit) return
  await writeInstagramAudit({
    action: input.action,
    target: input.target,
    actor: opts?.actorId ?? 'jarvis',
    approval_state: input.approval_state ?? null,
    result: input.result,
    provider_response_status: input.provider_status,
    error_redacted: input.error ? redactSecrets(input.error) : null,
  })
}

export function instagramStatus() {
  const creds = getInstagramCredentials()
  return {
    ...creds,
    source: 'instagram.credentials',
    data_status: creds.ok ? ('verified' as const) : ('unavailable' as const),
    retrieved_at: new Date().toISOString(),
    period: null,
    timezone: null,
  }
}

export async function getInstagramProfile(
  opts?: InstagramProviderOptions
): Promise<InstagramMetricEnvelope<InstagramProfile>> {
  const retrieved_at = nowIso(opts)
  const source = 'instagram.graph.profile'
  if (!opts?.transport && !isInstagramConfigured()) {
    const missing = resolveInstagramCredentials()
    return unavailableEnvelope(
      source,
      retrieved_at,
      `Instagram not configured: ${missing.ok ? 'unknown' : missing.missing.join(', ')}. Follower/media counts are unavailable — not zero.`
    )
  }

  try {
    const ready = await getTransport(opts)
    if (!ready.ok) {
      return unavailableEnvelope(
        source,
        retrieved_at,
        `Instagram not configured: ${ready.missing.join(', ')}. Counts are unavailable — not zero.`
      )
    }
    const igUserId = await resolveIgUserId(ready.transport, ready.credentials)
    const raw = await ready.transport.get<Record<string, unknown>>(`/${igUserId}`, {
      fields: PROFILE_FIELDS,
    })
    if (!raw || typeof raw !== 'object' || !raw.id) {
      throw new Error('malformed Instagram profile response: missing id')
    }

    const followers = parseOptionalNumber(raw.followers_count)
    const mediaCount = parseOptionalNumber(raw.media_count)
    // Field absent → null (unavailable for that field). Explicit 0 from API → verified zero.
    const profile: InstagramProfile = {
      id: String(raw.id),
      username: typeof raw.username === 'string' ? raw.username : null,
      name: typeof raw.name === 'string' ? raw.name : null,
      biography: typeof raw.biography === 'string' ? raw.biography : null,
      website: typeof raw.website === 'string' ? raw.website : null,
      profile_picture_url:
        typeof raw.profile_picture_url === 'string' ? raw.profile_picture_url : null,
      followers_count: followers,
      follows_count: parseOptionalNumber(raw.follows_count),
      media_count: mediaCount,
      account_type: typeof raw.account_type === 'string' ? raw.account_type : null,
    }

    const partial =
      followers == null || mediaCount == null || profile.username == null
        ? ('partial' as const)
        : ('verified' as const)

    await auditAction(opts, {
      action: 'instagram.get_profile',
      target: igUserId,
      result: 'ok',
      provider_status: 200,
    })

    return {
      source,
      data_status: partial,
      retrieved_at,
      period: null,
      timezone: null,
      value: profile,
      note:
        partial === 'partial'
          ? 'Some profile fields were absent from the Graph response; absent fields are null, not zero.'
          : 'Instagram profile retrieved from Graph API.',
      provenance: metricProvenance({
        metric: 'instagram.followers_count',
        value: followers,
        timezone: 'UTC',
        source,
        data_status: followers == null ? 'partial' : 'verified',
        calculation_method: 'Instagram Graph GET /{ig-user-id}?fields=followers_count',
        note: followers == null ? 'followers_count field absent' : undefined,
        source_timestamp: retrieved_at,
      }),
    }
  } catch (err) {
    const failed = failedEnvelope<InstagramProfile>(source, retrieved_at, err)
    await auditAction(opts, {
      action: 'instagram.get_profile',
      target: null,
      result: 'failed',
      provider_status: failed.provider_status ?? null,
      error: failed.error,
    })
    return failed
  }
}

export async function listInstagramMedia(
  input?: { limit?: number },
  opts?: InstagramProviderOptions
): Promise<InstagramMetricEnvelope<InstagramMediaItem[]>> {
  const retrieved_at = nowIso(opts)
  const source = 'instagram.graph.media'
  const limit = Math.min(Math.max(input?.limit ?? 12, 1), 50)

  if (!opts?.transport && !isInstagramConfigured()) {
    return unavailableEnvelope(
      source,
      retrieved_at,
      'Instagram not configured. Recent media is unavailable — not an empty feed of zero posts.'
    )
  }

  try {
    const ready = await getTransport(opts)
    if (!ready.ok) {
      return unavailableEnvelope(
        source,
        retrieved_at,
        `Instagram not configured: ${ready.missing.join(', ')}. Media list unavailable — not zero.`
      )
    }
    const igUserId = await resolveIgUserId(ready.transport, ready.credentials)
    const raw = await ready.transport.get<{ data?: unknown }>(`/${igUserId}/media`, {
      fields: MEDIA_FIELDS,
      limit: String(limit),
    })
    if (!raw || !Array.isArray(raw.data)) {
      throw new Error('malformed Instagram media response: missing data array')
    }
    const items = raw.data
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map(mapMediaItem)
      .filter((m) => m.id)

    await auditAction(opts, {
      action: 'instagram.list_media',
      target: igUserId,
      result: 'ok',
      provider_status: 200,
    })

    return {
      source,
      data_status: 'verified',
      retrieved_at,
      period: null,
      timezone: null,
      value: items,
      note:
        items.length === 0
          ? 'Graph returned an empty media list (verified zero posts in this page).'
          : `Retrieved ${items.length} media item(s).`,
      provenance: metricProvenance({
        metric: 'instagram.media_count_page',
        value: items.length,
        timezone: 'UTC',
        source,
        data_status: 'verified',
        calculation_method: `Instagram Graph GET /{ig-user-id}/media?limit=${limit}`,
        sample_limit: limit,
        source_timestamp: retrieved_at,
      }),
    }
  } catch (err) {
    const failed = failedEnvelope<InstagramMediaItem[]>(source, retrieved_at, err)
    await auditAction(opts, {
      action: 'instagram.list_media',
      target: null,
      result: 'failed',
      provider_status: failed.provider_status ?? null,
      error: failed.error,
    })
    return failed
  }
}

export async function getInstagramMedia(
  mediaId: string,
  opts?: InstagramProviderOptions
): Promise<InstagramMetricEnvelope<InstagramMediaItem>> {
  const retrieved_at = nowIso(opts)
  const source = 'instagram.graph.media_item'

  if (!mediaId?.trim()) {
    return {
      source,
      data_status: 'failed',
      retrieved_at,
      period: null,
      timezone: null,
      value: null,
      note: 'mediaId is required',
      error: 'mediaId is required',
      error_code: 'invalid_input',
      provider_status: null,
    }
  }

  if (!opts?.transport && !isInstagramConfigured()) {
    return unavailableEnvelope(
      source,
      retrieved_at,
      'Instagram not configured. Media metadata unavailable.'
    )
  }

  try {
    const ready = await getTransport(opts)
    if (!ready.ok) {
      return unavailableEnvelope(
        source,
        retrieved_at,
        `Instagram not configured: ${ready.missing.join(', ')}`
      )
    }
    const raw = await ready.transport.get<Record<string, unknown>>(`/${mediaId}`, {
      fields: MEDIA_FIELDS,
    })
    if (!raw?.id) throw new Error('malformed Instagram media item: missing id')
    const item = mapMediaItem(raw)
    await auditAction(opts, {
      action: 'instagram.get_media',
      target: mediaId,
      result: 'ok',
      provider_status: 200,
    })
    return {
      source,
      data_status: 'verified',
      retrieved_at,
      period: null,
      timezone: null,
      value: item,
      note: 'Media metadata retrieved from Graph API.',
    }
  } catch (err) {
    const failed = failedEnvelope<InstagramMediaItem>(source, retrieved_at, err)
    await auditAction(opts, {
      action: 'instagram.get_media',
      target: mediaId,
      result: 'failed',
      provider_status: failed.provider_status ?? null,
      error: failed.error,
    })
    return failed
  }
}

export async function getInstagramMediaInsights(
  mediaId: string,
  metrics?: string[],
  opts?: InstagramProviderOptions
): Promise<InstagramMetricEnvelope<InstagramInsightMetric[]>> {
  const retrieved_at = nowIso(opts)
  const source = 'instagram.graph.media_insights'
  const metricList =
    metrics && metrics.length
      ? metrics
      : // Safer Instagram Login defaults (media-type-specific callers should override).
        // Avoid impressions/plays/engagement — often rejected depending on product type.
        ['reach', 'saved', 'shares', 'views', 'total_interactions']

  if (!opts?.transport && !isInstagramConfigured()) {
    return unavailableEnvelope(
      source,
      retrieved_at,
      'Instagram not configured. Media insights unavailable — not zero engagement.'
    )
  }

  try {
    const ready = await getTransport(opts)
    if (!ready.ok) {
      return unavailableEnvelope(
        source,
        retrieved_at,
        `Instagram not configured: ${ready.missing.join(', ')}. Insights unavailable — not zero.`
      )
    }
    const raw = await ready.transport.get<{ data?: unknown }>(`/${mediaId}/insights`, {
      metric: metricList.join(','),
    })
    if (!raw || !Array.isArray(raw.data)) {
      throw new Error('malformed Instagram insights response: missing data array')
    }

    const insights: InstagramInsightMetric[] = raw.data
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => {
        const valuesRaw = Array.isArray(row.values) ? row.values : []
        return {
          name: typeof row.name === 'string' ? row.name : 'unknown',
          period: typeof row.period === 'string' ? row.period : null,
          title: typeof row.title === 'string' ? row.title : null,
          description: typeof row.description === 'string' ? row.description : null,
          values: valuesRaw.map((v) => {
            const rec = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
            return {
              value: parseOptionalNumber(rec.value),
              end_time: typeof rec.end_time === 'string' ? rec.end_time : null,
            }
          }),
        }
      })

    await auditAction(opts, {
      action: 'instagram.media_insights',
      target: mediaId,
      result: 'ok',
      provider_status: 200,
    })

    return {
      source,
      data_status: insights.length ? 'verified' : 'partial',
      retrieved_at,
      period: { label: 'media_lifetime_or_provider_period' },
      timezone: null,
      value: insights,
      note: insights.length
        ? 'Media insights returned by Graph. Metric availability depends on media type and token scopes.'
        : 'Insights endpoint returned an empty metric set (partial — not interpreted as zero engagement).',
    }
  } catch (err) {
    const failed = failedEnvelope<InstagramInsightMetric[]>(source, retrieved_at, err)
    await auditAction(opts, {
      action: 'instagram.media_insights',
      target: mediaId,
      result: 'failed',
      provider_status: failed.provider_status ?? null,
      error: failed.error,
    })
    return failed
  }
}

/**
 * Distinguishes verified zero followers from unavailable.
 * Used by tests and callers that must not treat null as 0.
 */
export function followersFromProfileEnvelope(
  envelope: InstagramMetricEnvelope<InstagramProfile>
): number | null {
  if (envelope.data_status === 'failed' || envelope.data_status === 'unavailable') return null
  if (!envelope.value) return null
  return envelope.value.followers_count
}
