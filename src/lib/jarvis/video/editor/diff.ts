/**
 * EDL structured diff — v1 → v2.
 */

import type { EditDecisionList, EdlDiff, EdlDiffOp, TimelineClip } from '@/lib/jarvis/video/editor/types'

function clipKey(c: TimelineClip): string {
  return `${c.purpose}:${c.source_id}:${c.source_start_ms}-${c.source_end_ms}`
}

export function diffEdls(from: EditDecisionList, to: EditDecisionList): EdlDiff {
  const ops: EdlDiffOp[] = []
  const fromMap = new Map(from.timeline.map((c) => [clipKey(c), c]))
  const toMap = new Map(to.timeline.map((c) => [clipKey(c), c]))

  for (const [key, before] of fromMap) {
    if (!toMap.has(key)) {
      ops.push({
        kind: 'removed',
        path: `timeline.${before.purpose}`,
        before: {
          source_id: before.source_id,
          start_ms: before.source_start_ms,
          end_ms: before.source_end_ms,
        },
        summary: `Removed ${before.purpose} ${before.source_start_ms}-${before.source_end_ms}ms`,
      })
    }
  }

  for (const [key, after] of toMap) {
    const before = fromMap.get(key)
    if (!before) {
      // Check replacement (same purpose, different source)
      const samePurpose = from.timeline.find((c) => c.purpose === after.purpose)
      if (samePurpose && samePurpose.source_id !== after.source_id) {
        ops.push({
          kind: 'replaced',
          path: `timeline.${after.purpose}`,
          before: { source_id: samePurpose.source_id },
          after: { source_id: after.source_id },
          summary: `Replaced ${after.purpose} source ${samePurpose.source_id} → ${after.source_id}`,
        })
      } else {
        ops.push({
          kind: 'added',
          path: `timeline.${after.purpose}`,
          after: {
            source_id: after.source_id,
            start_ms: after.source_start_ms,
            end_ms: after.source_end_ms,
          },
          summary: `Added ${after.purpose}`,
        })
      }
    } else {
      if (
        before.timeline_end_ms - before.timeline_start_ms !==
          after.timeline_end_ms - after.timeline_start_ms ||
        before.playback_rate !== after.playback_rate ||
        before.scale !== after.scale
      ) {
        ops.push({
          kind: 'changed',
          path: `timeline.${after.purpose}`,
          before: {
            duration_ms: before.timeline_end_ms - before.timeline_start_ms,
            playback_rate: before.playback_rate,
            scale: before.scale,
          },
          after: {
            duration_ms: after.timeline_end_ms - after.timeline_start_ms,
            playback_rate: after.playback_rate,
            scale: after.scale,
          },
          summary: `Changed ${after.purpose} timing/scale/rate`,
        })
      } else {
        ops.push({
          kind: 'unchanged',
          path: `timeline.${after.purpose}`,
          summary: `Unchanged ${after.purpose}`,
        })
      }
    }
  }

  // Overlays
  const fromTexts = from.overlays.map((o) => o.text).join('|')
  const toTexts = to.overlays.map((o) => o.text).join('|')
  if (fromTexts !== toTexts) {
    ops.push({
      kind: 'changed',
      path: 'overlays',
      before: from.overlays.map((o) => o.text),
      after: to.overlays.map((o) => o.text),
      summary: 'Changed overlay text',
    })
  }

  if (from.audio.source_volume !== to.audio.source_volume || from.audio.mute !== to.audio.mute) {
    ops.push({
      kind: 'changed',
      path: 'audio',
      before: { volume: from.audio.source_volume, mute: from.audio.mute },
      after: { volume: to.audio.source_volume, mute: to.audio.mute },
      summary: 'Changed audio',
    })
  }

  const changed = ops.filter((o) => o.kind !== 'unchanged')
  const preserved = ops.filter((o) => o.kind === 'unchanged')

  return {
    from_version: from.version,
    to_version: to.version,
    ops,
    preserved_count: preserved.length,
    changed_count: changed.length,
  }
}
