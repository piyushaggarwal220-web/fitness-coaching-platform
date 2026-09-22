/**
 * Text overlays (hook / emphasis / CTA) — distinct from speech-synced captions.
 */

import { randomUUID } from 'crypto'
import type { OverlayKind, TextOverlay } from '@/lib/jarvis/video/editor/types'

export function buildOverlays(input: {
  hookText?: string | null
  ctaText?: string | null
  emphasis?: string[]
  hookEndMs?: number
  timelineEndMs: number
  reduce?: boolean
}): TextOverlay[] {
  const out: TextOverlay[] = []
  const hookEnd = Math.min(input.hookEndMs ?? 2200, Math.max(1500, input.timelineEndMs))

  if (input.hookText?.trim()) {
    out.push({
      id: randomUUID(),
      kind: 'HOOK_TEXT',
      text: input.hookText.trim().slice(0, 64),
      start_ms: 0,
      end_ms: hookEnd,
      position: 'bottom',
      style_preset: 'fitness_social_minimal',
      provenance: 'phase5_suggested_overlay',
    })
  }

  if (!input.reduce) {
    for (const e of (input.emphasis || []).slice(0, 2)) {
      if (!e.trim()) continue
      out.push({
        id: randomUUID(),
        kind: 'EMPHASIS_TEXT',
        text: e.trim().slice(0, 48),
        start_ms: Math.min(hookEnd + 500, Math.max(0, input.timelineEndMs - 4000)),
        end_ms: Math.min(hookEnd + 3500, input.timelineEndMs),
        position: 'bottom',
        style_preset: 'fitness_social_minimal',
        provenance: 'phase5_suggested_overlay',
      })
    }
  }

  if (input.ctaText?.trim() && input.timelineEndMs > 2000) {
    out.push({
      id: randomUUID(),
      kind: 'CTA_TEXT',
      text: input.ctaText.trim().slice(0, 64),
      start_ms: Math.max(0, input.timelineEndMs - 4000),
      end_ms: input.timelineEndMs,
      position: 'bottom',
      style_preset: 'fitness_social_minimal',
      provenance: 'phase5_cta',
    })
  }

  return out
}

export function overlayKindLabel(kind: OverlayKind): string {
  return kind
}
