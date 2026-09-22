/**
 * Publish package builder — only fields supported by Instagram Login publish path.
 */

import type { PublishPackage } from '@/lib/jarvis/content-ops/types'
import { getContentOpsById, savePublishPackage } from '@/lib/jarvis/content-ops/store'

export function buildPublishPackage(input: {
  contentId: string
  caption: string
  mediaRef?: string | null
  videoJobId?: string | null
  scheduledTime?: string | null
  mediaType?: 'IMAGE' | 'VIDEO' | 'REELS'
  hashtags?: string[]
  firstComment?: string | null
  metadata?: Record<string, unknown>
}): PublishPackage {
  const tags = (input.hashtags ?? []).map((h) => h.replace(/^#/, '').trim()).filter(Boolean).slice(0, 8)
  return {
    content_id: input.contentId,
    media_ref: input.mediaRef ?? null,
    video_job_id: input.videoJobId ?? null,
    caption: input.caption.trim(),
    first_comment: input.firstComment ?? null,
    hashtags: tags,
    scheduled_time: input.scheduledTime ?? null,
    platform: 'instagram',
    media_type: input.mediaType ?? 'REELS',
    metadata: {
      ...(input.metadata ?? {}),
      hashtags_optional: true,
      note: 'Hashtags are optional metadata; they do not guarantee reach.',
    },
  }
}

export function validatePublishPackage(pkg: PublishPackage): {
  ok: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (!pkg.content_id) errors.push('missing_content_id')
  if (!pkg.caption?.trim()) errors.push('missing_caption')
  if (!pkg.media_ref && !pkg.video_job_id) errors.push('missing_media')
  if (!['IMAGE', 'VIDEO', 'REELS'].includes(pkg.media_type)) {
    errors.push('UNSUPPORTED_MEDIA_TYPE')
  }
  if (pkg.platform !== 'instagram') errors.push('unsupported_platform')
  return { ok: errors.length === 0, errors }
}

export async function preparePublishPackageForContent(input: {
  contentId: string
  caption?: string
  mediaUrl?: string | null
  videoJobId?: string | null
  mediaType?: 'IMAGE' | 'VIDEO' | 'REELS'
}): Promise<{ ok: boolean; package?: PublishPackage; errors?: string[]; error?: string }> {
  const row = await getContentOpsById(input.contentId)
  if (!row) return { ok: false, error: 'content_not_found' }

  const caption =
    input.caption ||
    row.approved_caption ||
    row.caption ||
    ''
  const mediaRef =
    input.mediaUrl ||
    (row.metadata?.media_url as string | undefined) ||
    null
  const videoJobId =
    input.videoJobId ||
    row.render_job_id ||
    (row.metadata?.video_job_id as string | undefined) ||
    null

  const pkg = buildPublishPackage({
    contentId: input.contentId,
    caption,
    mediaRef,
    videoJobId,
    scheduledTime: row.scheduled_for,
    mediaType: input.mediaType,
    hashtags: Array.isArray(row.metadata?.hashtags)
      ? (row.metadata!.hashtags as string[])
      : undefined,
  })

  const v = validatePublishPackage(pkg)
  if (!v.ok) return { ok: false, package: pkg, errors: v.errors }

  await savePublishPackage(input.contentId, pkg)
  return { ok: true, package: pkg }
}
