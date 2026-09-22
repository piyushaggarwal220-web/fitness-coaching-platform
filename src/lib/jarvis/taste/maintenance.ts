/**
 * Background taste maintenance — cheap, deterministic.
 */

import {
  getTasteProfile,
  markStaleTastePreferences,
  listTastePreferences,
} from '@/lib/jarvis/taste/store'
import { createAdminClient } from '@/lib/supabase/admin'

export async function runTasteMaintenance(opts?: {
  maxStaleMarks?: number
}): Promise<{
  stale_marked: number
  confirmation_asks: number
  active: number
  candidates: number
  conflicts: number
  notification: string | null
}> {
  const stale = await markStaleTastePreferences(opts?.maxStaleMarks ?? 10)
  const profile = await getTasteProfile()

  let notification: string | null = null
  const ask = profile.confirmation_asks[0]
  if (ask && ask.evidence_count >= 3 && ask.confidence >= 0.55) {
    notification = ask.ask
    // Soft notification via jarvis_notifications if table exists — best effort
    try {
      const admin = createAdminClient()
      await admin.from('jarvis_notifications').insert({
        kind: 'taste_confirmation',
        title: 'Taste preference confirmation',
        body: ask.ask.slice(0, 500),
        severity: 'info',
        metadata: {
          preference_id: ask.preference_id,
          dimension: ask.dimension,
          preference_key: ask.preference_key,
        },
      })
    } catch {
      // notifications table optional / schema may differ
    }
  }

  return {
    stale_marked: stale.marked,
    confirmation_asks: profile.confirmation_asks.length,
    active: profile.preferences.length,
    candidates: profile.candidates.length,
    conflicts: profile.conflicts.length,
    notification,
  }
}

export async function learnFromEdlRevisionEvent(input: {
  feedback: string
  diff: import('@/lib/jarvis/video/editor/types').EdlDiff
  changed: string[]
  edl_id: string
  edl_version: number
  creative_content_id?: string | null
  actorId?: string | null
}) {
  const { signalsFromEdlDiff } = await import('@/lib/jarvis/taste/evidence')
  const { ingestTasteSignals } = await import('@/lib/jarvis/taste/store')
  const signals = signalsFromEdlDiff({
    diff: input.diff,
    feedback: input.feedback,
    changed: input.changed,
  })
  return ingestTasteSignals(signals, {
    edl_id: input.edl_id,
    edl_version: input.edl_version,
    creative_content_id: input.creative_content_id,
    actorId: input.actorId,
    feedback_text: input.feedback,
    diff_summary: input.diff.ops
      .filter((o) => o.kind !== 'unchanged')
      .map((o) => o.summary)
      .slice(0, 8)
      .join('; '),
  })
}

export async function learnFromRenderDecision(input: {
  kind: 'approved' | 'rejected'
  job_id: string
  edl_id?: string | null
  reason?: string | null
  actorId?: string | null
}) {
  const { parseTasteFeedback } = await import('@/lib/jarvis/taste/parse')
  const { signalsFromWeakRejection } = await import('@/lib/jarvis/taste/evidence')
  const { ingestTasteSignals } = await import('@/lib/jarvis/taste/store')

  if (input.kind === 'rejected') {
    const signals = signalsFromWeakRejection(input.reason)
    return ingestTasteSignals(signals, {
      render_job_id: input.job_id,
      edl_id: input.edl_id,
      actorId: input.actorId,
      feedback_text: input.reason,
    })
  }

  // Approval: weak positive evidence only if we can load EDL taste warnings
  if (input.edl_id) {
    const admin = createAdminClient()
    const { data: edlRow } = await admin
      .from('jarvis_video_edls')
      .select('edl, version')
      .eq('id', input.edl_id)
      .maybeSingle()
    const edl = edlRow?.edl as { warnings?: string[] } | null
    const tasteApplied = (edl?.warnings || []).filter((w) => w.startsWith('TASTE_APPLIED'))
    if (tasteApplied.some((w) => /zoom|Restrained/i.test(w))) {
      const signals = parseTasteFeedback('I like restrained zooms')
      // Boost as approval of restrained zoom property
      return ingestTasteSignals(
        signals.map((s) => ({
          ...s,
          evidence_type: 'RENDER_APPROVAL' as const,
          confidence: 0.1,
          skip_learning: false,
          is_revision_only: false,
        })),
        {
          render_job_id: input.job_id,
          edl_id: input.edl_id,
          edl_version: edlRow?.version,
          actorId: input.actorId,
          feedback_text: 'render approved with restrained zooms',
        }
      )
    }
  }

  return [
    {
      ok: true,
      preference_id: null,
      evidence_id: null,
      status: 'skipped',
      confidence: 0,
      note: 'Approval recorded without inventing preferences for all properties.',
    },
  ]
}

export async function countActiveTaste(): Promise<number> {
  const prefs = await listTastePreferences({ status: ['ACTIVE'], limit: 100 })
  return prefs.length
}
