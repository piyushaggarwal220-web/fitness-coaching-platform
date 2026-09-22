/**
 * Targeted EDL revision — patch engine. Keep everything else the same.
 */

import type { EditDecisionList, TimelineClip } from '@/lib/jarvis/video/editor/types'
import { diffEdls } from '@/lib/jarvis/video/editor/diff'
import { loadEdl, saveEdl, appendEdlFeedback, updateEdlStatus } from '@/lib/jarvis/video/editor/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { estimateEdlRenderCostUsd } from '@/lib/jarvis/video/editor/cost'

export type RevisionTarget =
  | 'ZOOM'
  | 'HOOK_SPEED'
  | 'HOOK_TEXT'
  | 'CTA'
  | 'CAPTIONS'
  | 'CLIP'
  | 'TAKE'
  | 'ORDER'
  | 'AUDIO'
  | 'GENERAL'

export function parseRevisionFeedback(feedback: string): {
  targets: RevisionTarget[]
  preserve_rest: boolean
} {
  const f = feedback.toLowerCase()
  const targets: RevisionTarget[] = []
  if (/zoom/.test(f)) targets.push('ZOOM')
  if (/faster|hook.*(fast|short)|first two seconds|speed/.test(f)) targets.push('HOOK_SPEED')
  if (/hook text|change the hook|new hook/.test(f)) targets.push('HOOK_TEXT')
  if (/cta|call to action|final cta|remove the final/.test(f)) targets.push('CTA')
  if (/caption|text.*(small|less)|smaller/.test(f)) targets.push('CAPTIONS')
  if (/don't show|do not show|remove clip|clip \d/.test(f)) targets.push('CLIP')
  if (/other take|second take|use.*take/.test(f)) targets.push('TAKE')
  if (/start with|reorder|squat footage/.test(f)) targets.push('ORDER')
  if (/mute|volume|audio/.test(f)) targets.push('AUDIO')
  if (!targets.length) targets.push('GENERAL')
  const preserve_rest = /keep everything else|keep the rest|only|just /.test(f) || targets.length > 0
  return { targets, preserve_rest }
}

function cloneEdl(edl: EditDecisionList): EditDecisionList {
  return JSON.parse(JSON.stringify(edl)) as EditDecisionList
}

export function applyEdlPatch(
  edl: EditDecisionList,
  feedback: string
): { edl: EditDecisionList; changed: string[]; targets: RevisionTarget[] } {
  const { targets } = parseRevisionFeedback(feedback)
  const next = cloneEdl(edl)
  const changed: string[] = []
  const f = feedback.toLowerCase()

  if (targets.includes('ZOOM')) {
    for (const c of next.timeline) {
      if (c.scale > 1) {
        c.scale = 1
        changed.push(`Removed zoom/scale on ${c.purpose}`)
      }
    }
    // Also strip any high_retention style notes
    next.unsupported_features = next.unsupported_features.filter(
      (u) => u.feature !== 'aggressive_zoom'
    )
    changed.push('Disabled zooms (scale=1)')
  }

  if (targets.includes('HOOK_SPEED')) {
    const hook = next.timeline.find((c) => c.purpose === 'HOOK' && !c.missing)
    if (hook) {
      const oldDur = hook.timeline_end_ms - hook.timeline_start_ms
      const newDur = Math.max(800, Math.round(oldDur * 0.6))
      const shrink = oldDur - newDur
      hook.source_end_ms = hook.source_start_ms + newDur
      hook.timeline_end_ms = hook.timeline_start_ms + newDur
      if (hook.trim) hook.trim.end_ms = hook.source_end_ms
      // Shift subsequent clips
      for (const c of next.timeline) {
        if (c.timeline_start_ms >= hook.timeline_start_ms + oldDur) {
          c.timeline_start_ms -= shrink
          c.timeline_end_ms -= shrink
        }
      }
      changed.push(`Hook duration ${oldDur}ms → ${newDur}ms`)
    }
  }

  if (targets.includes('HOOK_TEXT')) {
    const hookOverlay = next.overlays.find((o) => o.kind === 'HOOK_TEXT')
    const m = feedback.match(/hook(?:\s+text)?(?:\s+to)?[:\s]+["']?([^"']+)["']?/i)
    if (hookOverlay && m?.[1]) {
      hookOverlay.text = m[1].trim().slice(0, 64)
      changed.push(`Hook text → ${hookOverlay.text}`)
    } else if (hookOverlay) {
      // generic: leave marker
      changed.push('Hook text revision requested (provide explicit replacement text)')
    }
  }

  if (targets.includes('CTA')) {
    if (/remove/.test(f)) {
      next.timeline = next.timeline.filter((c) => c.purpose !== 'CTA')
      next.overlays = next.overlays.filter((o) => o.kind !== 'CTA_TEXT')
      changed.push('Removed CTA clip/overlay')
    }
  }

  if (targets.includes('CAPTIONS')) {
    if (/smaller|less|fewer|don't|do not/.test(f)) {
      next.overlays = next.overlays.slice(0, 1)
      next.captions = next.captions.slice(0, 1)
      changed.push('Reduced captions/overlays')
    }
  }

  if (targets.includes('CLIP')) {
    const m = f.match(/clip\s*(\d+)/)
    if (m) {
      const idx = Number(m[1]) - 1
      if (idx >= 0 && idx < next.timeline.length) {
        const removed = next.timeline[idx]!
        next.timeline.splice(idx, 1)
        changed.push(`Removed clip ${idx + 1} (${removed.purpose})`)
        reflowTimeline(next.timeline)
      }
    }
  }

  if (targets.includes('TAKE')) {
    // Swap first HOOK source with alternate from same session take group if available — async handled in reviseEdl
    changed.push('TAKE swap deferred to async reviseEdl')
  }

  if (targets.includes('ORDER') && /start with/.test(f)) {
    // Move PROOF/BODY matching keyword to front if present
    const squat = next.timeline.findIndex(
      (c) => /squat|demo|proof/i.test(c.purpose) || /squat/i.test(c.provenance)
    )
    if (squat > 0) {
      const [clip] = next.timeline.splice(squat, 1)
      next.timeline.unshift(clip!)
      reflowTimeline(next.timeline)
      changed.push('Reordered timeline to start with matching clip')
    }
  }

  if (targets.includes('AUDIO')) {
    if (/mute/.test(f)) {
      next.audio.mute = true
      changed.push('Muted source audio')
    }
  }

  // Recompute duration + cost
  next.estimated_duration_ms = next.timeline
    .filter((c) => !c.missing)
    .reduce((s, c) => s + (c.timeline_end_ms - c.timeline_start_ms), 0)
  next.estimated_render_cost_usd = estimateEdlRenderCostUsd(next.estimated_duration_ms || 15000)
  next.user_feedback = feedback
  next.revision_reason = feedback.slice(0, 500)
  next.changed_operations = changed
  next.status = 'REVISION_REQUESTED'

  return { edl: next, changed, targets }
}

function reflowTimeline(clips: TimelineClip[]) {
  let cursor = 0
  for (const c of clips) {
    const len = c.timeline_end_ms - c.timeline_start_ms
    c.timeline_start_ms = cursor
    c.timeline_end_ms = cursor + len
    cursor += len
  }
}

export async function reviseEdl(input: {
  edl_id: string
  feedback: string
  actorId?: string | null
}): Promise<{
  ok: boolean
  edl_id: string | null
  version: number | null
  edl: EditDecisionList | null
  diff: ReturnType<typeof diffEdls> | null
  changed: string[]
  note: string
}> {
  const loaded = await loadEdl(input.edl_id)
  if (!loaded) {
    return {
      ok: false,
      edl_id: null,
      version: null,
      edl: null,
      diff: null,
      changed: [],
      note: 'EDL not found',
    }
  }

  const { edl: patched, changed, targets } = applyEdlPatch(loaded.edl, input.feedback)

  // Async take swap
  if (targets.includes('TAKE')) {
    const swapped = await trySwapHookTake(patched)
    if (swapped) changed.push('Swapped hook to alternate take')
  }

  patched.version = loaded.version + 1
  patched.parent_edl_id = loaded.id
  patched.id = null

  await appendEdlFeedback(loaded.id, {
    feedback: input.feedback,
    targets,
    changed,
  })
  await updateEdlStatus(loaded.id, 'REVISION_REQUESTED')

  const saved = await saveEdl({ edl: patched, actorId: input.actorId })
  patched.id = saved.id

  const diff = diffEdls(loaded.edl, patched)

  // Phase 7: record taste evidence from revision (deterministic, cheap)
  try {
    const { learnFromEdlRevisionEvent } = await import('@/lib/jarvis/taste')
    await learnFromEdlRevisionEvent({
      feedback: input.feedback,
      diff,
      changed,
      edl_id: saved.id,
      edl_version: saved.version,
      creative_content_id: patched.creative_content_id,
      actorId: input.actorId,
    })
  } catch {
    // Taste learning must not break revision
  }

  return {
    ok: true,
    edl_id: saved.id,
    version: saved.version,
    edl: patched,
    diff,
    changed,
    note: `EDL v${saved.version} created. Changed: ${changed.join('; ') || 'none'}. Rest preserved. Not rendered.`,
  }
}

async function trySwapHookTake(edl: EditDecisionList): Promise<boolean> {
  const hook = edl.timeline.find((c) => c.purpose === 'HOOK' && c.source_id)
  if (!hook?.source_id) return false
  const admin = createAdminClient()
  const { data: groups } = await admin
    .from('jarvis_video_take_groups')
    .select('source_ids')
    .limit(20)
  for (const g of groups ?? []) {
    const ids = (g.source_ids || []) as string[]
    if (ids.includes(hook.source_id) && ids.length > 1) {
      const alt = ids.find((id) => id !== hook.source_id)
      if (!alt) continue
      const { data: src } = await admin
        .from('jarvis_video_sources')
        .select('id, source_ref')
        .eq('id', alt)
        .maybeSingle()
      if (!src) continue
      hook.source_id = src.id
      hook.source_ref = src.source_ref
      hook.provenance = `${hook.provenance}|take_swap:${alt}`
      return true
    }
  }
  return false
}
