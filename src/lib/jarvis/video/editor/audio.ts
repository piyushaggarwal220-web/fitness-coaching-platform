/**
 * Basic audio plan for EDL.
 */

import type { EdlAudio } from '@/lib/jarvis/video/editor/types'

export function defaultEdlAudio(overrides?: Partial<EdlAudio>): EdlAudio {
  return {
    source_volume: overrides?.source_volume ?? 1,
    mute: overrides?.mute ?? false,
    fade_in_ms: overrides?.fade_in_ms ?? 0,
    fade_out_ms: overrides?.fade_out_ms ?? 0,
    music_track_ref: overrides?.music_track_ref ?? null,
    music_note:
      overrides?.music_note ??
      'No music auto-selected. Rendering without music is valid. Do not invent licenses.',
  }
}
