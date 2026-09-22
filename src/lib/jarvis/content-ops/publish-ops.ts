/**
 * Publish operations — wraps existing Instagram publish with ops state + idempotency.
 * Does not rebuild Graph auth or create a second publisher.
 */

import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram/credentials'
import { executeInstagramPublish } from '@/lib/jarvis/instagram/publish'
import { canPublish } from '@/lib/jarvis/content-ops/state-machine'
import {
  getContentOpsById,
  publishIdempotencyKey,
  resolveOpsState,
  transitionContentOps,
} from '@/lib/jarvis/content-ops/store'
import {
  preparePublishPackageForContent,
  validatePublishPackage,
} from '@/lib/jarvis/content-ops/publish-package'
import type { PublishPackage } from '@/lib/jarvis/content-ops/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'node:crypto'

export type PublishGateResult = {
  ok: boolean
  code?: string
  reason: string
  live_enabled: boolean
  package?: PublishPackage
}

export async function evaluatePublishGates(contentId: string): Promise<PublishGateResult> {
  const live = liveInstagramPublishingEnabled()
  const row = await getContentOpsById(contentId)
  if (!row) {
    return { ok: false, code: 'NOT_FOUND', reason: 'Content not found', live_enabled: live }
  }

  const state = resolveOpsState(row)
  if (!canPublish(state)) {
    return {
      ok: false,
      code: 'NOT_APPROVED',
      reason: `Content state ${state} is not publishable. Must be APPROVED or SCHEDULED.`,
      live_enabled: live,
    }
  }

  if (row.published_media_id) {
    return {
      ok: false,
      code: 'ALREADY_PUBLISHED',
      reason: `Already published (media_id=${row.published_media_id}). Idempotent skip.`,
      live_enabled: live,
    }
  }

  const prep = await preparePublishPackageForContent({ contentId })
  if (!prep.ok || !prep.package) {
    return {
      ok: false,
      code: prep.errors?.includes('UNSUPPORTED_MEDIA_TYPE')
        ? 'UNSUPPORTED_MEDIA_TYPE'
        : 'INVALID_PACKAGE',
      reason: `Publish package invalid: ${(prep.errors ?? [prep.error]).join(', ')}`,
      live_enabled: live,
      package: prep.package,
    }
  }

  const v = validatePublishPackage(prep.package)
  if (!v.ok) {
    return {
      ok: false,
      code: v.errors.includes('UNSUPPORTED_MEDIA_TYPE')
        ? 'UNSUPPORTED_MEDIA_TYPE'
        : 'INVALID_PACKAGE',
      reason: `Publish package invalid: ${v.errors.join(', ')}`,
      live_enabled: live,
      package: prep.package,
    }
  }

  if (!live) {
    return {
      ok: false,
      code: 'PUBLISHING_NOT_ENABLED',
      reason:
        'LIVE_INSTAGRAM_PUBLISHING_ENABLED is not true. Set LIVE_INSTAGRAM_PUBLISHING_ENABLED=true plus Instagram Login credentials to enable live publish. Graph publish was not called.',
      live_enabled: false,
      package: prep.package,
    }
  }

  return {
    ok: true,
    reason: 'All publish gates passed (approval still required by tool runner).',
    live_enabled: true,
    package: prep.package,
  }
}

/**
 * Execute publish after SIGNIFICANT approval. Idempotent on published_media_id / key.
 */
export async function publishContentOps(input: {
  contentId: string
  actorId?: string | null
  approved: boolean
}): Promise<{
  ok: boolean
  published: boolean
  media_id?: string | null
  recorded_not_executed?: boolean
  code?: string
  note: string
  error?: string
}> {
  if (!input.approved) {
    return {
      ok: false,
      published: false,
      code: 'approval_required',
      note: 'SIGNIFICANT approval required for Instagram publish.',
      error: 'approval_required',
    }
  }

  const row = await getContentOpsById(input.contentId)
  if (!row) {
    return { ok: false, published: false, code: 'NOT_FOUND', note: 'Content not found' }
  }

  if (row.published_media_id) {
    return {
      ok: true,
      published: true,
      media_id: row.published_media_id,
      code: 'ALREADY_PUBLISHED',
      note: 'Idempotent: already published — not publishing again.',
    }
  }

  const gates = await evaluatePublishGates(input.contentId)
  // Allow recorded_not_executed path when publishing disabled but approved
  if (!gates.ok && gates.code !== 'PUBLISHING_NOT_ENABLED') {
    return {
      ok: false,
      published: false,
      code: gates.code,
      note: gates.reason,
      error: gates.code,
    }
  }

  const pkg = gates.package
  if (!pkg) {
    return { ok: false, published: false, code: 'INVALID_PACKAGE', note: 'Missing publish package' }
  }

  const attemptId = randomUUID()
  await transitionContentOps({
    contentId: input.contentId,
    to: 'PUBLISHING',
    reason: 'publish_attempt',
    actor: input.actorId ?? 'jarvis',
    patch: {
      publish_attempt_id: attemptId,
      publish_idempotency_key: publishIdempotencyKey(input.contentId),
    },
  })

  const result = await executeInstagramPublish(
    {
      contentId: input.contentId,
      caption: pkg.caption,
      mediaUrl: pkg.media_ref ?? undefined,
      videoJobId: pkg.video_job_id ?? undefined,
      mediaType: pkg.media_type,
      actorId: input.actorId,
      approved: true,
    }
  )

  if (result.published && result.media_id) {
    const admin = createAdminClient()
    await admin
      .from('marketing_content')
      .update({
        published_media_id: result.media_id,
        posted_at: new Date().toISOString(),
        measurement_status: 'pending',
        metadata: {
          ...(row.metadata ?? {}),
          ig_media_id: result.media_id,
          ig_creation_id: result.creation_id,
          publish_attempt_id: attemptId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.contentId)

    await transitionContentOps({
      contentId: input.contentId,
      to: 'PUBLISHED',
      reason: 'instagram_confirmed',
      actor: input.actorId ?? 'jarvis',
    })

    return {
      ok: true,
      published: true,
      media_id: result.media_id,
      note: result.note,
    }
  }

  if (result.recorded_not_executed) {
    // Do not mark PUBLISHED — honest about disabled flag
    await transitionContentOps({
      contentId: input.contentId,
      to: 'APPROVED',
      reason: 'publishing_not_enabled',
      actor: input.actorId ?? 'jarvis',
    })
    return {
      ok: true,
      published: false,
      recorded_not_executed: true,
      code: 'PUBLISHING_NOT_ENABLED',
      note: result.note,
    }
  }

  await transitionContentOps({
    contentId: input.contentId,
    to: 'FAILED',
    reason: result.error ?? 'publish_failed',
    actor: input.actorId ?? 'jarvis',
    patch: { blocking_reason: result.error ?? result.note },
  })

  return {
    ok: false,
    published: false,
    code: 'FAILED',
    note: result.note,
    error: result.error,
  }
}
