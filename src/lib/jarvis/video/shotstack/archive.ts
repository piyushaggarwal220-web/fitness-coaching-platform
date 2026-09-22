/**
 * Archive completed Shotstack outputs into private LURVOX storage.
 * Provider URLs expire (~24h); we copy when possible.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { JARVIS_VIDEO_BUCKET } from '@/lib/jarvis/video/sources'

export async function archiveShotstackResult(input: {
  jobId: string
  providerUrl: string
  renderId: string
}): Promise<{
  ok: boolean
  storage_path?: string
  output_ref?: string
  provider_url_kept?: string
  error?: string
  expired?: boolean
}> {
  try {
    const res = await fetch(input.providerUrl, { method: 'GET' })
    if (res.status === 403 || res.status === 404) {
      return {
        ok: false,
        expired: true,
        error: 'Provider output URL expired or unavailable.',
        provider_url_kept: input.providerUrl,
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `Failed to download provider output (${res.status}).`,
        provider_url_kept: input.providerUrl,
      }
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    if (!bytes.byteLength) {
      return { ok: false, error: 'Empty provider output.', provider_url_kept: input.providerUrl }
    }

    const storage_path = `results/${input.jobId}/${input.renderId}.mp4`
    const admin = createAdminClient()
    const { error } = await admin.storage.from(JARVIS_VIDEO_BUCKET).upload(storage_path, bytes, {
      contentType: 'video/mp4',
      upsert: true,
    })
    if (error) {
      return {
        ok: false,
        error: `Private archive failed: ${error.message}`,
        provider_url_kept: input.providerUrl,
      }
    }

    return {
      ok: true,
      storage_path,
      output_ref: `jarvis-video-result://${input.jobId}/${input.renderId}`,
      provider_url_kept: input.providerUrl,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      provider_url_kept: input.providerUrl,
    }
  }
}

export async function createSignedResultPreviewUrl(storagePath: string, expiresSec = 3600) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(JARVIS_VIDEO_BUCKET)
    .createSignedUrl(storagePath, expiresSec)
  if (error || !data?.signedUrl) {
    return { ok: false as const, error: error?.message || 'Failed to sign result URL' }
  }
  return { ok: true as const, url: data.signedUrl }
}
