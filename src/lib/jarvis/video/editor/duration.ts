/**
 * Duration guidance — prefer coherence over padding.
 */

import { TARGET_DURATIONS_SEC } from '@/lib/jarvis/video/editor/types'

export function nearestTargetDurationSec(estimatedSec: number): number {
  let best: number = TARGET_DURATIONS_SEC[0]!
  let bestDiff = Math.abs(estimatedSec - best)
  for (const t of TARGET_DURATIONS_SEC) {
    const d = Math.abs(estimatedSec - t)
    if (d < bestDiff) {
      best = t
      bestDiff = d
    }
  }
  return best
}

export function clampTargetDurationSec(sec: number | null | undefined): number | null {
  if (sec == null || !Number.isFinite(sec)) return null
  return Math.min(90, Math.max(7, sec))
}
