/**
 * Caption planning — provenance must be explicit. Never claim AI text is transcript-derived.
 */

import type { CaptionCue, CaptionProvenance } from '@/lib/jarvis/video/editor/types'
import { randomUUID } from 'crypto'

export const DEFAULT_CAPTION_STYLE = 'fitness_social_minimal'

export function buildCaptions(input: {
  lines: Array<{ text: string; start_ms: number; end_ms: number; provenance: CaptionProvenance }>
  max?: number
}): CaptionCue[] {
  return input.lines
    .filter((l) => l.text.trim() && l.end_ms > l.start_ms)
    .slice(0, input.max ?? 8)
    .map((l) => ({
      id: randomUUID(),
      text: l.text.trim().slice(0, 80),
      start_ms: l.start_ms,
      end_ms: l.end_ms,
      provenance: l.provenance,
      style_preset: DEFAULT_CAPTION_STYLE,
    }))
}

/** Speech-synced captions only when transcript timestamps exist. */
export function captionsFromTranscriptSegments(
  segments: Array<{ text: string; start: number; end: number }>
): CaptionCue[] {
  return buildCaptions({
    lines: segments.map((s) => ({
      text: s.text,
      start_ms: Math.round(s.start * 1000),
      end_ms: Math.round(s.end * 1000),
      provenance: 'TRANSCRIPT_DERIVED' as const,
    })),
  })
}
