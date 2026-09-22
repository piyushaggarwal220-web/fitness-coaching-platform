/**
 * Background content-ops maintenance — hooks into existing background cycle.
 * Bounded retries. Permanent errors stop.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram/credentials'
import { buildDailyContentBrief, formatDailyBriefText } from '@/lib/jarvis/content-ops/brief'
import { evaluatePublishGates } from '@/lib/jarvis/content-ops/publish-ops'
import { resolveOpsState, transitionContentOps } from '@/lib/jarvis/content-ops/store'
import { startMeasurement } from '@/lib/jarvis/content-ops/measurement'
import { createApprovalRequest } from '@/lib/jarvis/permissions/approval-engine'
import { randomUUID } from 'node:crypto'

const MAX_PUBLISH_RETRIES = 3
const PERMANENT_ERRORS = new Set([
  'AUTH_ERROR',
  'approval_required',
  'INVALID_MEDIA',
  'INVALID_PACKAGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'NOT_APPROVED',
  'missing_ig_user',
  'not_configured',
])

export async function runContentOpsMaintenance(opts?: {
  actorId?: string | null
}): Promise<Record<string, unknown>> {
  const admin = createAdminClient()
  const actions: string[] = []
  const notes: string[] = []

  // 1. Due scheduled publishes
  const nowIso = new Date().toISOString()
  const { data: due } = await admin
    .from('marketing_content')
    .select('id, ops_state, status, scheduled_for, published_media_id, metadata, publish_attempt_id')
    .eq('platform', 'instagram')
    .eq('ops_state', 'SCHEDULED')
    .lte('scheduled_for', nowIso)
    .is('published_media_id', null)
    .limit(3)

  for (const row of due ?? []) {
    const contentId = row.id as string
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const retries = Number(meta.publish_retries ?? 0)

    const gates = await evaluatePublishGates(contentId)
    if (gates.code === 'ALREADY_PUBLISHED') {
      actions.push(`skip_idempotent:${contentId.slice(0, 8)}`)
      continue
    }

    if (gates.code === 'PUBLISHING_NOT_ENABLED') {
      notes.push(`PUBLISHING_NOT_ENABLED for ${contentId.slice(0, 8)}`)
      actions.push('publish:disabled')
      // Create approval so human can decide when enabling live
      try {
        await createApprovalRequest({
          conversationId: null,
          taskId: null,
          toolCallId: randomUUID(),
          toolName: 'content_ops.publish',
          actionLabel: `Publish scheduled content ${contentId.slice(0, 8)}`,
          reason: `Scheduled publish due. ${gates.reason}`,
          evidence: [gates.reason],
          currentState: { content_id: contentId, ops_state: 'SCHEDULED' },
          proposedState: { action: 'instagram_publish', live_enabled: false },
          riskLevel: 'high',
          riskClass: 'SIGNIFICANT',
          actorId: opts?.actorId ?? null,
        })
        actions.push('publish:approval_created')
      } catch {
        /* may already exist */
      }
      continue
    }

    if (!gates.ok) {
      const permanent = gates.code && PERMANENT_ERRORS.has(gates.code)
      if (permanent || retries >= MAX_PUBLISH_RETRIES) {
        await transitionContentOps({
          contentId,
          to: 'FAILED',
          reason: gates.code ?? 'publish_gate_failed',
          actor: 'background',
          patch: { blocking_reason: gates.reason },
        })
        actions.push(`publish:failed_permanent:${gates.code}`)
      } else {
        await admin
          .from('marketing_content')
          .update({
            metadata: { ...meta, publish_retries: retries + 1, last_gate_error: gates.code },
            updated_at: new Date().toISOString(),
          })
          .eq('id', contentId)
        actions.push(`publish:retry_deferred:${retries + 1}`)
      }
      continue
    }

    // Gates OK + live enabled — still require approval card; do not auto-publish without approved execution
    try {
      const caption = gates.package?.caption?.slice(0, 120) ?? ''
      await createApprovalRequest({
        conversationId: null,
        taskId: null,
        toolCallId: randomUUID(),
        toolName: 'content_ops.publish',
        actionLabel: `Publish Reel to Instagram at scheduled time`,
        reason: `Publish content ${contentId} — caption: ${caption}`,
        evidence: [
          `content_id=${contentId}`,
          `scheduled_time=${gates.package?.scheduled_time ?? 'n/a'}`,
          `media_type=${gates.package?.media_type ?? 'REELS'}`,
          'WHAT WILL HAPPEN: Instagram Login Graph media publish if LIVE_INSTAGRAM_PUBLISHING_ENABLED=true',
        ],
        currentState: { content_id: contentId, ops_state: 'SCHEDULED' },
        proposedState: {
          action: 'instagram_publish',
          caption: gates.package?.caption,
          media_ref: gates.package?.media_ref,
          platform: 'instagram',
        },
        expectedCostNote: 'Graph API publish — cost governor still applies to related AI ops',
        riskLevel: 'high',
        riskClass: 'SIGNIFICANT',
        actorId: opts?.actorId ?? null,
      })
      actions.push('publish:awaiting_approval')
    } catch {
      actions.push('publish:approval_exists_or_failed')
    }
  }

  // 2. Published → measuring
  const { data: published } = await admin
    .from('marketing_content')
    .select('id')
    .eq('ops_state', 'PUBLISHED')
    .limit(5)
  for (const row of published ?? []) {
    await startMeasurement(row.id as string)
    actions.push('measurement:started')
  }

  // 3. Stuck editing / rendering (bounded signal only — editor recovery exists in background-cycle)
  const { data: stuckEdit } = await admin
    .from('marketing_content')
    .select('id, ops_state, updated_at')
    .eq('ops_state', 'EDITING')
    .lt('updated_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .limit(3)
  for (const row of stuckEdit ?? []) {
    await admin
      .from('marketing_content')
      .update({
        blocking_reason: 'Stuck in EDITING — check render/webhook',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    actions.push('recovery:stuck_editing_flagged')
  }

  // 4. Daily brief (notify only when meaningful)
  const brief = await buildDailyContentBrief()
  if (brief.meaningful) {
    const text = formatDailyBriefText(brief)
    await admin.from('jarvis_notifications').insert({
      kind: 'content_brief',
      title: 'Daily content brief',
      body: text,
      severity: 'info',
      metadata: { brief },
    })
    actions.push('brief:notified')
    notes.push(text.split('\n')[0] ?? 'brief')
  } else {
    actions.push('brief:skipped_not_meaningful')
  }

  return {
    live_publishing_enabled: liveInstagramPublishingEnabled(),
    actions,
    notes,
    due_count: due?.length ?? 0,
  }
}

/** Classify retryability for tests / callers */
export function isRetryablePublishError(code: string | null | undefined): boolean {
  if (!code) return false
  if (PERMANENT_ERRORS.has(code)) return false
  return code === 'RATE_LIMIT' || code === 'TEMPORARY_PROVIDER_ERROR' || code === 'FAILED'
}

export async function getBlockedContentSummary(): Promise<{
  blocked: { id: string; reason: string; state: string }[]
}> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('marketing_content')
    .select('id, blocking_reason, ops_state, status')
    .eq('platform', 'instagram')
    .not('blocking_reason', 'is', null)
    .limit(30)
  return {
    blocked: (data ?? []).map((r) => ({
      id: r.id as string,
      reason: r.blocking_reason as string,
      state: resolveOpsState(r as { ops_state?: string; status?: string }),
    })),
  }
}
