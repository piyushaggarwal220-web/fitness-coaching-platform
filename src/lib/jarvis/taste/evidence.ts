/**
 * EDL diff → taste signals (strong observational source).
 * Repeated matching diffs raise confidence; one diff ≠ permanent preference.
 */

import type { EdlDiff, EdlDiffOp } from '@/lib/jarvis/video/editor/types'
import type { TasteSignal } from '@/lib/jarvis/taste/types'
import { parseTasteFeedback } from '@/lib/jarvis/taste/parse'

function zoomReduced(op: EdlDiffOp): boolean {
  if (op.path.includes('timeline') && op.kind === 'changed') {
    const before = op.before as { scale?: number } | undefined
    const after = op.after as { scale?: number } | undefined
    if (before?.scale != null && after?.scale != null && before.scale > 1 && after.scale <= 1) {
      return true
    }
  }
  return /zoom|scale/i.test(op.summary) && /removed|disabled|→ 1/i.test(op.summary)
}

function hookFaster(op: EdlDiffOp): boolean {
  if (!/HOOK|hook/i.test(op.path + op.summary)) return false
  const before = op.before as { duration_ms?: number } | undefined
  const after = op.after as { duration_ms?: number } | undefined
  if (before?.duration_ms != null && after?.duration_ms != null) {
    return after.duration_ms < before.duration_ms
  }
  return /duration|faster|→/i.test(op.summary)
}

function captionsReduced(op: EdlDiffOp): boolean {
  if (op.path !== 'overlays' && op.path !== 'captions' && !/caption/i.test(op.summary)) {
    return false
  }
  const before = op.before
  const after = op.after
  if (Array.isArray(before) && Array.isArray(after)) {
    return after.length < before.length
  }
  return /reduced|fewer|smaller/i.test(op.summary)
}

/**
 * Extract taste signals from a structured EDL diff (+ optional feedback text).
 */
export function signalsFromEdlDiff(input: {
  diff: EdlDiff
  feedback?: string | null
  changed?: string[]
}): TasteSignal[] {
  const out: TasteSignal[] = []

  if (input.feedback?.trim()) {
    for (const s of parseTasteFeedback(input.feedback)) {
      if (s.skip_learning) continue
      out.push({
        ...s,
        evidence_type: 'EDL_REVISION',
        confidence: Math.min(s.confidence, 0.25),
        note: `${s.note} (via EDL revision)`,
      })
    }
  }

  for (const op of input.diff.ops) {
    if (op.kind === 'unchanged') continue
    if (zoomReduced(op) || /Removed zoom|Disabled zooms/i.test(op.summary)) {
      out.push({
        dimension: 'EDITING',
        preference_key: 'zoom_frequency',
        preference_value: 'restrained',
        polarity: 'DECREASE',
        direction: 'DECREASE',
        evidence_type: 'EDL_REVISION',
        confidence: 0.2,
        signal: 'ZOOM_REDUCED_IN_DIFF',
        scope: 'GLOBAL',
        is_revision_only: false,
        is_hard_constraint: false,
        skip_learning: false,
        note: op.summary,
      })
    }
    if (hookFaster(op)) {
      out.push({
        dimension: 'PACING',
        preference_key: 'hook_pace',
        preference_value: 'fast',
        polarity: 'INCREASE',
        direction: 'FASTER',
        evidence_type: 'EDL_REVISION',
        confidence: 0.2,
        signal: 'HOOK_SHORTENED_IN_DIFF',
        scope: 'HOOK',
        is_revision_only: false,
        is_hard_constraint: false,
        skip_learning: false,
        note: op.summary,
      })
    }
    if (captionsReduced(op)) {
      out.push({
        dimension: 'CAPTIONS',
        preference_key: 'caption_density',
        preference_value: 'minimal',
        polarity: 'DECREASE',
        direction: 'DECREASE',
        evidence_type: 'EDL_REVISION',
        confidence: 0.2,
        signal: 'CAPTIONS_REDUCED_IN_DIFF',
        scope: 'GLOBAL',
        is_revision_only: false,
        is_hard_constraint: false,
        skip_learning: false,
        note: op.summary,
      })
    }
    if (/Removed CTA/i.test(op.summary)) {
      out.push({
        dimension: 'CTA',
        preference_key: 'cta_presence',
        preference_value: 'optional',
        polarity: 'AVOID',
        direction: 'AVOID',
        evidence_type: 'EDL_REVISION',
        confidence: 0.15,
        signal: 'CTA_REMOVED_IN_DIFF',
        scope: 'CREATIVE',
        is_revision_only: false,
        is_hard_constraint: false,
        skip_learning: false,
        note: op.summary,
      })
    }
  }

  for (const c of input.changed || []) {
    if (/zoom/i.test(c) && /removed|disabled/i.test(c)) {
      if (!out.some((s) => s.signal === 'ZOOM_REDUCED_IN_DIFF')) {
        out.push({
          dimension: 'EDITING',
          preference_key: 'zoom_frequency',
          preference_value: 'restrained',
          polarity: 'DECREASE',
          direction: 'DECREASE',
          evidence_type: 'EDL_REVISION',
          confidence: 0.2,
          signal: 'ZOOM_REDUCED_IN_DIFF',
          scope: 'GLOBAL',
          is_revision_only: false,
          is_hard_constraint: false,
          skip_learning: false,
          note: c,
        })
      }
    }
  }

  return dedupeSignals(out)
}

export function signalsFromWeakRejection(reason?: string | null): TasteSignal[] {
  if (reason?.trim()) {
    return parseTasteFeedback(reason).filter((s) => !s.skip_learning)
  }
  return [
    {
      dimension: 'CONTENT',
      preference_key: 'render_rejection',
      preference_value: 'unspecified',
      polarity: 'NEUTRAL',
      direction: 'NEGATIVE',
      evidence_type: 'RENDER_REJECTION',
      confidence: 0.05,
      signal: 'WEAK_REJECTION',
      scope: 'GLOBAL',
      is_revision_only: true,
      is_hard_constraint: false,
      skip_learning: true,
      note: 'Rejection without feedback — weak evidence only; no preference invented.',
    },
  ]
}

function dedupeSignals(signals: TasteSignal[]): TasteSignal[] {
  const map = new Map<string, TasteSignal>()
  for (const s of signals) {
    const k = `${s.dimension}:${s.preference_key}:${s.preference_value}:${s.polarity}`
    const prev = map.get(k)
    if (!prev || s.confidence > prev.confidence) map.set(k, s)
  }
  return [...map.values()]
}
