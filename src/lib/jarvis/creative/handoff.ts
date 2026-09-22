/**
 * Phase 6 handoff payload — structured edit input, NOT an EDL/render.
 */

import type { SourceMapping } from '@/lib/jarvis/video/intelligence/types'
import type { EditHandoffPayload, ScriptBeat } from '@/lib/jarvis/creative/types'

export function buildEditHandoff(input: {
  creative_id?: string | null
  duration: number
  source_segments: SourceMapping[]
  beats: ScriptBeat[]
  overlays: string[]
  new_recording: string[]
  cta: string
  minimal_zooms?: boolean
}): EditHandoffPayload {
  return {
    creative_id: input.creative_id ?? null,
    duration: input.duration,
    source_segments: input.source_segments,
    sequence: input.beats.map((b) => ({
      role: b.role,
      kind: b.kind,
      source: b.source ?? null,
      text: b.text,
    })),
    captions: input.overlays.slice(0, input.minimal_zooms ? 2 : 6),
    overlays: input.overlays,
    transitions: ['hard_cut'],
    music_direction: null,
    new_recording_segments: input.new_recording,
    cta: input.cta,
    note:
      'Phase 5 creative handoff for Phase 6 EDL. Do not auto-render or auto-publish.',
  }
}
