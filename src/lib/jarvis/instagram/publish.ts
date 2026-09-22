/**
 * Instagram publishing workflow (Instagram Login → graph.instagram.com).
 * Draft/prepare may be LOW_RISK. Actual publish is SIGNIFICANT + LIVE_INSTAGRAM_PUBLISHING_ENABLED.
 * Consumes completed video_edit_jobs — does not edit video inside Instagram.
 * Uses INSTAGRAM_ACCESS_TOKEN only — never META_ADS_ACCESS_TOKEN.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { MetaApiError } from '@/lib/ai-marketing/meta/client'
import { createInstagramGraphClient } from '@/lib/jarvis/instagram/client'
import {
  liveInstagramPublishingEnabled,
  resolveInstagramCredentials,
} from '@/lib/jarvis/instagram/credentials'
import {
  type InstagramProviderOptions,
  type InstagramTransport,
} from '@/lib/jarvis/instagram/provider'
import { writeInstagramAudit } from '@/lib/jarvis/instagram/audit'
import { redactSecrets } from '@/lib/jarvis/operator-errors'
import type { InstagramPublishRequest } from '@/lib/jarvis/instagram/types'

async function getTransport(
  opts?: InstagramProviderOptions
): Promise<
  | { ok: true; transport: InstagramTransport; igUserId: string | null; live: boolean }
  | { ok: false; missing: string[]; live: boolean }
> {
  const live = liveInstagramPublishingEnabled()
  if (opts?.transport && opts.credentials) {
    return {
      ok: true,
      transport: opts.transport,
      igUserId: opts.credentials.igUserId,
      live: opts.credentials.livePublishingEnabled,
    }
  }
  const resolved = resolveInstagramCredentials()
  if (!resolved.ok) return { ok: false, missing: resolved.missing, live }
  if (opts?.transport) {
    return {
      ok: true,
      transport: opts.transport,
      igUserId: resolved.credentials.igUserId,
      live: resolved.credentials.livePublishingEnabled,
    }
  }
  const client = createInstagramGraphClient({
    accessToken: resolved.credentials.accessToken,
    apiVersion: resolved.credentials.apiVersion,
  })
  return {
    ok: true,
    transport: client,
    igUserId: resolved.credentials.igUserId,
    live: resolved.credentials.livePublishingEnabled,
  }
}

export async function resolvePublishMediaAsset(input: {
  mediaUrl?: string
  videoJobId?: string
}): Promise<{
  ok: boolean
  media_url: string | null
  video_job_id: string | null
  data_status: 'verified' | 'unavailable' | 'failed'
  note: string
  error?: string
}> {
  if (input.mediaUrl?.trim()) {
    return {
      ok: true,
      media_url: input.mediaUrl.trim(),
      video_job_id: input.videoJobId ?? null,
      data_status: 'verified',
      note: 'Using provided media URL.',
    }
  }
  if (!input.videoJobId) {
    return {
      ok: false,
      media_url: null,
      video_job_id: null,
      data_status: 'unavailable',
      note: 'No media URL or video_edit_jobs id provided.',
      error: 'media_required',
    }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('video_edit_jobs')
      .select('id, status, output_video, error')
      .eq('id', input.videoJobId)
      .maybeSingle()

    if (error) {
      return {
        ok: false,
        media_url: null,
        video_job_id: input.videoJobId,
        data_status: 'failed',
        note: 'Failed to read video_edit_jobs.',
        error: error.message,
      }
    }
    if (!data) {
      return {
        ok: false,
        media_url: null,
        video_job_id: input.videoJobId,
        data_status: 'unavailable',
        note: 'Video job not found.',
        error: 'video_job_not_found',
      }
    }
    if (data.status !== 'completed' || !data.output_video) {
      return {
        ok: false,
        media_url: null,
        video_job_id: input.videoJobId,
        data_status: 'unavailable',
        note: `Video job is not a completed asset (status=${data.status}). Instagram does not edit video.`,
        error: data.error || 'video_not_ready',
      }
    }
    return {
      ok: true,
      media_url: String(data.output_video),
      video_job_id: data.id,
      data_status: 'verified',
      note: 'Resolved completed video_edit_jobs output for Instagram publish.',
    }
  } catch (err) {
    return {
      ok: false,
      media_url: null,
      video_job_id: input.videoJobId,
      data_status: 'failed',
      note: 'Video asset resolution failed.',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Prepare a publish payload / draft without calling Graph publish. */
export async function prepareInstagramPublish(
  input: InstagramPublishRequest & { actorId?: string | null }
): Promise<{
  ok: boolean
  prepared: boolean
  published: false
  requires_approval_for_publish: true
  content_id?: string
  media_url: string | null
  caption: string
  media_type: string
  live_publishing_enabled: boolean
  data_status: 'verified' | 'unavailable' | 'failed'
  note: string
  error?: string
}> {
  const asset = await resolvePublishMediaAsset({
    mediaUrl: input.mediaUrl,
    videoJobId: input.videoJobId,
  })

  const admin = createAdminClient()
  let contentId = input.contentId

  if (contentId) {
    await admin
      .from('marketing_content')
      .update({
        caption: input.caption,
        status: 'draft',
        metadata: {
          publish_prepared_at: new Date().toISOString(),
          media_url: asset.media_url,
          video_job_id: asset.video_job_id,
          media_type: input.mediaType ?? 'REELS',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', contentId)
  } else {
    const { data } = await admin
      .from('marketing_content')
      .insert({
        platform: 'instagram',
        content_type: 'reel',
        caption: input.caption,
        status: 'draft',
        keywords: [],
        hashtags: [],
        metadata: {
          publish_prepared_at: new Date().toISOString(),
          media_url: asset.media_url,
          video_job_id: asset.video_job_id,
          media_type: input.mediaType ?? 'REELS',
        },
        created_by: input.actorId ?? null,
      })
      .select('id')
      .maybeSingle()
    contentId = data?.id
  }

  await writeInstagramAudit({
    action: 'instagram.prepare_publish',
    target: contentId ?? null,
    actor: input.actorId ?? 'jarvis',
    approval_state: 'not_required_for_prepare',
    result: asset.ok ? 'prepared' : 'prepared_without_media',
    provider_response_status: null,
    error_redacted: asset.error ?? null,
  })

  return {
    ok: true,
    prepared: true,
    published: false,
    requires_approval_for_publish: true,
    content_id: contentId,
    media_url: asset.media_url,
    caption: input.caption,
    media_type: input.mediaType ?? 'REELS',
    live_publishing_enabled: liveInstagramPublishingEnabled(),
    data_status: asset.data_status === 'verified' ? 'verified' : asset.data_status,
    note: asset.ok
      ? 'Publish draft prepared. Actual Instagram publishing requires SIGNIFICANT approval and LIVE_INSTAGRAM_PUBLISHING_ENABLED=true.'
      : `Draft prepared but media incomplete: ${asset.note}`,
    error: asset.error,
  }
}

/**
 * Execute Instagram publish. Caller (action-runner) must already have human approval
 * for SIGNIFICANT. Live Graph publish still requires LIVE_INSTAGRAM_PUBLISHING_ENABLED.
 */
export async function executeInstagramPublish(
  input: InstagramPublishRequest & { actorId?: string | null; approved?: boolean },
  opts?: InstagramProviderOptions
): Promise<{
  ok: boolean
  published: boolean
  recorded_not_executed?: boolean
  creation_id?: string | null
  media_id?: string | null
  data_status: 'verified' | 'unavailable' | 'failed'
  provider_response_status: number | null
  note: string
  error?: string
}> {
  if (!input.approved) {
    await writeInstagramAudit({
      action: 'instagram.publish',
      target: input.contentId ?? null,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'missing',
      result: 'blocked',
      provider_response_status: null,
      error_redacted: 'Approval required for Instagram publish',
    })
    return {
      ok: false,
      published: false,
      data_status: 'unavailable',
      provider_response_status: null,
      note: 'Instagram publish blocked — human approval required. Generation of a caption is not approval.',
      error: 'approval_required',
    }
  }

  // Idempotency: never publish twice for the same content row
  if (input.contentId) {
    try {
      const admin = createAdminClient()
      const { data: existing } = await admin
        .from('marketing_content')
        .select('published_media_id, metadata, status')
        .eq('id', input.contentId)
        .maybeSingle()
      const mediaId =
        (existing?.published_media_id as string | null | undefined) ||
        ((existing?.metadata as Record<string, unknown> | null)?.ig_media_id as string | undefined)
      if (mediaId) {
        await writeInstagramAudit({
          action: 'instagram.publish',
          target: input.contentId,
          actor: input.actorId ?? 'jarvis',
          approval_state: 'approved',
          result: 'idempotent_skip',
          provider_response_status: null,
          extra: { media_id: mediaId },
        })
        return {
          ok: true,
          published: true,
          media_id: mediaId,
          data_status: 'verified',
          provider_response_status: null,
          note: 'Idempotent skip — content already has published_media_id / ig_media_id.',
        }
      }
    } catch {
      /* continue to publish attempt */
    }
  }

  const asset = await resolvePublishMediaAsset({
    mediaUrl: input.mediaUrl,
    videoJobId: input.videoJobId,
  })
  if (!asset.ok || !asset.media_url) {
    await writeInstagramAudit({
      action: 'instagram.publish',
      target: input.contentId ?? null,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'failed',
      provider_response_status: null,
      error_redacted: asset.error ?? 'media_required',
    })
    return {
      ok: false,
      published: false,
      data_status: asset.data_status,
      provider_response_status: null,
      note: asset.note,
      error: asset.error,
    }
  }

  const live = liveInstagramPublishingEnabled() || opts?.credentials?.livePublishingEnabled === true
  if (!live) {
    await writeInstagramAudit({
      action: 'instagram.publish',
      target: input.contentId ?? null,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'recorded_not_executed',
      provider_response_status: null,
      extra: { reason: 'LIVE_INSTAGRAM_PUBLISHING_ENABLED=false' },
    })
    return {
      ok: true,
      published: false,
      recorded_not_executed: true,
      data_status: 'verified',
      provider_response_status: null,
      note: 'Approval recorded. LIVE_INSTAGRAM_PUBLISHING_ENABLED is not true — Graph publish was not called.',
    }
  }

  try {
    const ready = await getTransport(opts)
    if (!ready.ok) {
      return {
        ok: false,
        published: false,
        data_status: 'unavailable',
        provider_response_status: null,
        note: `Instagram not configured: ${ready.missing.join(', ')}`,
        error: 'not_configured',
      }
    }

    return publishWithTransport({
      transport: ready.transport,
      igUserId: ready.igUserId,
      input,
      mediaUrl: asset.media_url,
      actorId: input.actorId,
    })
  } catch (err) {
    const error = redactSecrets(err instanceof Error ? err.message : String(err))
    const status = err instanceof MetaApiError ? err.status ?? null : null
    await writeInstagramAudit({
      action: 'instagram.publish',
      target: input.contentId ?? null,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'failed',
      provider_response_status: status,
      error_redacted: error,
    })
    return {
      ok: false,
      published: false,
      data_status: 'failed',
      provider_response_status: status,
      note: 'Instagram publish failed.',
      error,
    }
  }
}

async function publishWithTransport(params: {
  transport: InstagramTransport
  igUserId: string | null
  input: InstagramPublishRequest
  mediaUrl: string
  actorId?: string | null
}) {
  let igUserId = params.igUserId
  if (!igUserId) {
    const me = await params.transport.get<{ user_id?: string; id?: string }>('/me', {
      fields: 'user_id,username',
    })
    igUserId = me?.user_id || (typeof me?.id === 'string' ? me.id : null)
  }
  if (!igUserId) {
    await writeInstagramAudit({
      action: 'instagram.publish',
      target: params.input.contentId ?? null,
      actor: params.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'failed',
      provider_response_status: null,
      error_redacted: 'Missing Instagram business account id',
    })
    return {
      ok: false,
      published: false,
      data_status: 'unavailable' as const,
      provider_response_status: null,
      note: 'INSTAGRAM_BUSINESS_ACCOUNT_ID required to publish (Instagram Login).',
      error: 'missing_ig_user',
    }
  }

  const mediaType = params.input.mediaType ?? 'REELS'
  const container = (await params.transport.post(`/${igUserId}/media`, {
    caption: params.input.caption,
    ...(mediaType === 'IMAGE'
      ? { image_url: params.mediaUrl }
      : { video_url: params.mediaUrl, media_type: mediaType === 'VIDEO' ? 'VIDEO' : 'REELS' }),
  })) as { id?: string }

  if (!container?.id) {
    throw new MetaApiError('Instagram media container create returned no id', 502)
  }

  const published = (await params.transport.post(`/${igUserId}/media_publish`, {
    creation_id: container.id,
  })) as { id?: string }

  if (!published?.id) {
    throw new MetaApiError(
      'Instagram media_publish returned no media id — publish not confirmed',
      502
    )
  }

  if (params.input.contentId) {
    const admin = createAdminClient()
    await admin
      .from('marketing_content')
      .update({
        status: 'posted',
        ops_state: 'PUBLISHED',
        posted_at: new Date().toISOString(),
        published_media_id: published.id,
        measurement_status: 'pending',
        metadata: {
          ig_creation_id: container.id,
          ig_media_id: published.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.input.contentId)
  }

  await writeInstagramAudit({
    action: 'instagram.publish',
    target: published.id,
    actor: params.actorId ?? 'jarvis',
    approval_state: 'approved',
    result: 'published',
    provider_response_status: 200,
    extra: { creation_id: container.id, media_id: published.id },
  })

  return {
    ok: true,
    published: true,
    creation_id: container.id,
    media_id: published.id,
    data_status: 'verified' as const,
    provider_response_status: 200,
    note: 'Instagram media published via Instagram Login Graph API (graph.instagram.com).',
  }
}

export async function executeInstagramDelete(
  input: { mediaId: string; actorId?: string | null; approved?: boolean },
  opts?: InstagramProviderOptions
): Promise<{
  ok: boolean
  deleted: boolean
  recorded_not_executed?: boolean
  data_status: 'verified' | 'unavailable' | 'failed'
  provider_response_status: number | null
  note: string
  error?: string
}> {
  if (!input.approved) {
    await writeInstagramAudit({
      action: 'instagram.delete_media',
      target: input.mediaId,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'missing',
      result: 'blocked',
      provider_response_status: null,
      error_redacted: 'Approval required',
    })
    return {
      ok: false,
      deleted: false,
      data_status: 'unavailable',
      provider_response_status: null,
      note: 'Delete requires SIGNIFICANT approval.',
      error: 'approval_required',
    }
  }

  if (!liveInstagramPublishingEnabled() && opts?.credentials?.livePublishingEnabled !== true) {
    await writeInstagramAudit({
      action: 'instagram.delete_media',
      target: input.mediaId,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'recorded_not_executed',
      provider_response_status: null,
    })
    return {
      ok: true,
      deleted: false,
      recorded_not_executed: true,
      data_status: 'verified',
      provider_response_status: null,
      note: 'Approval recorded. LIVE_INSTAGRAM_PUBLISHING_ENABLED=false — delete not executed.',
    }
  }

  // Destructive delete against Graph is intentionally not auto-wired without an explicit
  // transport injection in this V1 to avoid accidental live deletes. Prefer recorded_not_executed
  // unless a test transport is provided.
  if (!opts?.transport) {
    await writeInstagramAudit({
      action: 'instagram.delete_media',
      target: input.mediaId,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'recorded_not_executed',
      provider_response_status: null,
      extra: { reason: 'delete_requires_explicit_transport_in_v1' },
    })
    return {
      ok: true,
      deleted: false,
      recorded_not_executed: true,
      data_status: 'verified',
      provider_response_status: null,
      note: 'Delete approval recorded. Live Graph delete is not enabled without explicit provider transport in V1.',
    }
  }

  try {
    await opts.transport.post(`/${input.mediaId}`, { method: 'delete' } as never)
    await writeInstagramAudit({
      action: 'instagram.delete_media',
      target: input.mediaId,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'deleted',
      provider_response_status: 200,
    })
    return {
      ok: true,
      deleted: true,
      data_status: 'verified',
      provider_response_status: 200,
      note: 'Media delete requested via provider transport.',
    }
  } catch (err) {
    const error = redactSecrets(err instanceof Error ? err.message : String(err))
    await writeInstagramAudit({
      action: 'instagram.delete_media',
      target: input.mediaId,
      actor: input.actorId ?? 'jarvis',
      approval_state: 'approved',
      result: 'failed',
      provider_response_status: err instanceof MetaApiError ? err.status ?? null : null,
      error_redacted: error,
    })
    return {
      ok: false,
      deleted: false,
      data_status: 'failed',
      provider_response_status: err instanceof MetaApiError ? err.status ?? null : null,
      note: 'Delete failed.',
      error,
    }
  }
}

export function blockedInstagramAccountSettings() {
  return {
    ok: false,
    blocked: true,
    data_status: 'unavailable' as const,
    note: 'Modifying Instagram account settings is BLOCKED for Jarvis.',
    error: 'blocked_policy',
  }
}

export function blockedInstagramCredentialChanges() {
  return {
    ok: false,
    blocked: true,
    data_status: 'unavailable' as const,
    note: 'Instagram credential/permission changes are BLOCKED for Jarvis.',
    error: 'blocked_policy',
  }
}
