/**
 * EDL validator — never silently drops unsupported ops.
 */

import type { EditDecisionList, EdlValidationResult } from '@/lib/jarvis/video/editor/types'
import { sec } from '@/lib/jarvis/video/editor/types'

export function validateEdl(edl: EditDecisionList): EdlValidationResult {
  const errors: string[] = []
  const warnings = [...edl.warnings]

  const usable = edl.timeline.filter((c) => !c.missing)
  if (!usable.length) {
    errors.push('No usable timeline clips')
  }

  for (const c of edl.timeline) {
    if (c.missing) {
      errors.push(`NEW_RECORDING_REQUIRED at ${c.purpose}: ${c.missing_reason || 'missing'}`)
      continue
    }
    if (!c.source_id && !c.source_ref) {
      errors.push(`Clip ${c.id} missing source_id/source_ref`)
    }
    if (!(c.source_end_ms > c.source_start_ms)) {
      errors.push(`Clip ${c.id} invalid source range`)
    }
    if (!(c.timeline_end_ms > c.timeline_start_ms)) {
      errors.push(`Clip ${c.id} invalid timeline range`)
    }
    if (c.timeline_start_ms < 0) {
      errors.push(`Clip ${c.id} negative timeline position`)
    }
    if (c.playback_rate !== 1) {
      // Shotstack supports speed via length/trim tricks but we mark honesty
      warnings.push(`playback_rate ${c.playback_rate} on ${c.id} — verify provider support`)
    }
    const manifest = edl.source_manifest.find((m) => m.source_id === c.source_id)
    if (manifest?.duration_ms != null && c.source_end_ms > manifest.duration_ms + 50) {
      errors.push(
        `Clip ${c.id} source_end_ms ${c.source_end_ms} exceeds source duration ${manifest.duration_ms}`
      )
    }
  }

  // Overlap check on timeline
  const sorted = [...usable].sort((a, b) => a.timeline_start_ms - b.timeline_start_ms)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.timeline_start_ms < sorted[i - 1]!.timeline_end_ms - 1) {
      warnings.push('Overlapping timeline clips detected')
    }
  }

  const durationSec = sec(edl.estimated_duration_ms)
  if (durationSec > 120) {
    errors.push(`Output duration ${durationSec}s exceeds sane limit`)
  }
  if (durationSec > 0 && durationSec < 1) {
    errors.push('Output duration too short')
  }

  if (edl.aspect_ratio !== '9:16' && edl.aspect_ratio !== '1:1' && edl.aspect_ratio !== '16:9') {
    errors.push(`Unsupported aspect ratio ${edl.aspect_ratio}`)
  }

  for (const u of edl.unsupported_features) {
    if (u.status === 'UNSUPPORTED') {
      warnings.push(`UNSUPPORTED: ${u.feature} — ${u.note}`)
    }
  }

  // Forbidden: provider-specific leakage
  const raw = JSON.stringify(edl)
  if (/shotstack|x-api-key|timeline\.tracks/i.test(raw) && /"callback"\s*:/.test(raw)) {
    errors.push('Canonical EDL must not contain Shotstack provider payload')
  }

  const hasMissing = errors.some((e) => e.includes('NEW_RECORDING_REQUIRED'))
  const hasUnsupportedBlockers = false

  let status: EdlValidationResult['status'] = 'READY'
  if (hasMissing) status = 'MISSING_FOOTAGE'
  else if (errors.length) status = 'NEEDS_REVISION'
  else if (hasUnsupportedBlockers) status = 'UNSUPPORTED'

  return {
    ok: errors.length === 0,
    status,
    errors,
    warnings,
  }
}
