/**
 * Deterministic confidence model for Taste Engine.
 *
 * Documented scoring (not "3 events = truth"):
 * - EXPLICIT_FEEDBACK / USER_INSTRUCTION: +0.35 (+0.50 if hard "always/never")
 * - EDL_REVISION: +0.20
 * - REPEATED_REVISION (same key): +0.12 per additional matching event
 * - RENDER/CREATIVE_APPROVAL of aligned property: +0.10
 * - RENDER/CREATIVE_REJECTION without feedback: +0.05 (weak)
 * - PERFORMANCE_SIGNAL: never raises USER_TASTE; only AUDIENCE_SIGNAL
 * - CONFLICTING opposite polarity: −0.25, status → CONFLICTED
 * - STALE: −0.10 after 90 days without reinforcement; STALE if confidence < 0.30
 *
 * Thresholds:
 * - CANDIDATE until confidence ≥ 0.55 or user confirms
 * - ACTIVE auto-promotion only when confidence ≥ 0.70 AND evidence_count ≥ 3
 *   (still soft unless hard constraint)
 * - HARD_CONSTRAINT only from explicit never/always operating-rule language
 */

import type {
  TasteEvidenceType,
  TasteInfluenceMode,
  TastePolarity,
  TasteStatus,
} from '@/lib/jarvis/taste/types'

export const STALE_DAYS = 90
export const CANDIDATE_THRESHOLD = 0.55
export const ACTIVE_AUTO_THRESHOLD = 0.7
export const ACTIVE_MIN_EVIDENCE = 3

export function weightForEvidenceType(
  type: TasteEvidenceType,
  opts?: { hard?: boolean }
): number {
  switch (type) {
    case 'CONFIRMATION':
      return 0.4
    case 'USER_INSTRUCTION':
      return opts?.hard ? 0.5 : 0.35
    case 'EXPLICIT_FEEDBACK':
      return opts?.hard ? 0.45 : 0.35
    case 'EDL_REVISION':
      return 0.2
    case 'REPEATED_REVISION':
      return 0.12
    case 'RENDER_APPROVAL':
    case 'CREATIVE_APPROVAL':
      return 0.1
    case 'RENDER_REJECTION':
    case 'CREATIVE_REJECTION':
      return 0.05
    case 'PERFORMANCE_SIGNAL':
      return 0.08 // AUDIENCE only
    case 'REJECTION_OF_PREF':
      return 0
    default:
      return 0.05
  }
}

export function clampConfidence(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000))
}

export function applyEvidenceWeight(
  current: number,
  type: TasteEvidenceType,
  opts?: { hard?: boolean; conflicting?: boolean; reinforcing?: boolean }
): { confidence: number; reason: string } {
  if (opts?.conflicting) {
    const next = clampConfidence(current - 0.25)
    return {
      confidence: next,
      reason: `Conflicting evidence (−0.25) via ${type}`,
    }
  }
  const w = weightForEvidenceType(type, opts)
  const boost = opts?.reinforcing ? w : w
  const next = clampConfidence(current + boost * (1 - current * 0.35))
  return {
    confidence: next,
    reason: `+${boost.toFixed(2)} from ${type}${opts?.reinforcing ? ' (reinforcing)' : ''}`,
  }
}

export function resolveStatus(input: {
  confidence: number
  evidence_count: number
  positive: number
  negative: number
  current: TasteStatus
  confirmed?: boolean
  rejected?: boolean
  days_since_last?: number
}): { status: TasteStatus; influence: TasteInfluenceMode; reason: string } {
  if (input.rejected || input.current === 'REJECTED') {
    return {
      status: 'REJECTED',
      influence: 'OBSERVATION',
      reason: 'User rejected preference; evidence trail preserved.',
    }
  }
  if (input.confirmed) {
    return {
      status: 'ACTIVE',
      influence:
        input.confidence >= 0.85 ? 'STRONG_PREFERENCE' : 'SOFT_PREFERENCE',
      reason: 'User confirmed preference.',
    }
  }
  if (input.negative >= 2 && input.positive >= 2 && Math.abs(input.positive - input.negative) <= 1) {
    return {
      status: 'CONFLICTED',
      influence: 'OBSERVATION',
      reason: 'Positive and negative evidence both present.',
    }
  }
  if (
    input.days_since_last != null &&
    input.days_since_last >= STALE_DAYS &&
    input.confidence < 0.55
  ) {
    return {
      status: 'STALE',
      influence: 'OBSERVATION',
      reason: `No reinforcement for ${STALE_DAYS}+ days; confidence decayed.`,
    }
  }
  if (input.confidence >= ACTIVE_AUTO_THRESHOLD && input.evidence_count >= ACTIVE_MIN_EVIDENCE) {
    return {
      status: 'ACTIVE',
      influence: input.confidence >= 0.85 ? 'STRONG_PREFERENCE' : 'SOFT_PREFERENCE',
      reason: `Auto-active: confidence ${input.confidence} with ${input.evidence_count} evidence.`,
    }
  }
  if (input.confidence >= CANDIDATE_THRESHOLD) {
    return {
      status: 'CANDIDATE',
      influence: 'SOFT_PREFERENCE',
      reason: 'Meaningful candidate; eligible for confirmation ask.',
    }
  }
  return {
    status: 'CANDIDATE',
    influence: 'OBSERVATION',
    reason: 'Weak evidence — observation only.',
  }
}

export function oppositePolarity(a: TastePolarity, b: TastePolarity): boolean {
  const pairs: [TastePolarity, TastePolarity][] = [
    ['PREFER', 'AVOID'],
    ['INCREASE', 'DECREASE'],
  ]
  return pairs.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x)
  )
}

export function decayConfidence(
  confidence: number,
  daysSinceLast: number
): { confidence: number; reason: string } {
  if (daysSinceLast < STALE_DAYS) {
    return { confidence, reason: 'No decay yet.' }
  }
  const steps = Math.floor((daysSinceLast - STALE_DAYS) / 30) + 1
  const next = clampConfidence(confidence - 0.1 * steps)
  return {
    confidence: next,
    reason: `Staleness decay −${(0.1 * steps).toFixed(1)} after ${daysSinceLast} days.`,
  }
}
