/**
 * Deterministic before/after comparison — no causality claims.
 */

import type { OutcomeState } from '@/lib/jarvis/memory/scopes'

export type MetricExpectation = {
  metric: string
  baseline: number | null
  target?: number | null
  direction: 'increase' | 'decrease' | 'maintain' | 'unavailable'
  success_condition?: string
  unit?: string
}

export type MetricComparison = {
  metric: string
  before: number | null
  after: number | null
  absolute_diff: number | null
  percent_diff: number | null
  target: number | null
  target_gap: number | null
  direction_expected: MetricExpectation['direction']
  against_target: 'met' | 'missed' | 'unknown' | 'n/a'
  statement: string
}

export function compareMetric(
  expectation: MetricExpectation,
  actual: number | null
): MetricComparison {
  const before = expectation.baseline
  const after = actual
  const absolute_diff =
    before != null && after != null ? after - before : null
  const percent_diff =
    before != null && after != null && before !== 0
      ? ((after - before) / Math.abs(before)) * 100
      : before === 0 && after != null
        ? after === 0
          ? 0
          : null
        : null

  const target = expectation.target ?? null
  let against_target: MetricComparison['against_target'] = 'n/a'
  let target_gap: number | null = null
  if (target != null && after != null) {
    if (expectation.direction === 'decrease' || expectation.success_condition?.includes('≤')) {
      against_target = after <= target ? 'met' : 'missed'
      target_gap = after - target
    } else if (expectation.direction === 'increase' || expectation.success_condition?.includes('≥')) {
      against_target = after >= target ? 'met' : 'missed'
      target_gap = after - target
    } else if (expectation.direction === 'maintain') {
      const tol = Math.abs(target) * 0.05 || 1
      against_target = Math.abs(after - target) <= tol ? 'met' : 'missed'
      target_gap = after - target
    } else {
      against_target = 'unknown'
      target_gap = after - target
    }
  } else if (target != null || after == null) {
    against_target = 'unknown'
  }

  const statement =
    before == null || after == null
      ? `${expectation.metric}: comparison unavailable (missing baseline or actual).`
      : `${expectation.metric}: ${before} → ${after} (Δ ${absolute_diff! >= 0 ? '+' : ''}${absolute_diff!.toFixed(2)}${
          percent_diff != null ? `, ${percent_diff >= 0 ? '+' : ''}${percent_diff.toFixed(1)}%` : ''
        }). Association only — causality not established.`

  return {
    metric: expectation.metric,
    before,
    after,
    absolute_diff,
    percent_diff,
    target,
    target_gap,
    direction_expected: expectation.direction,
    against_target,
    statement,
  }
}

export function classifyOutcome(input: {
  comparisons: MetricComparison[]
  actionFailed?: boolean
  dataUnavailable?: boolean
}): OutcomeState {
  if (input.actionFailed) return 'FAILED_ACTION'
  if (input.dataUnavailable) return 'UNAVAILABLE'
  if (!input.comparisons.length) return 'INCONCLUSIVE'

  const usable = input.comparisons.filter((c) => c.after != null && c.before != null)
  if (!usable.length) return 'UNAVAILABLE'

  const withTarget = usable.filter((c) => c.against_target === 'met' || c.against_target === 'missed')
  if (withTarget.length) {
    const met = withTarget.filter((c) => c.against_target === 'met').length
    const missed = withTarget.filter((c) => c.against_target === 'missed').length
    if (met > 0 && missed === 0) return 'SUCCESS'
    if (met > 0 && missed > 0) return 'PARTIAL_SUCCESS'
    if (missed > 0 && met === 0) return 'UNDERPERFORMED'
  }

  const changed = usable.some(
    (c) => c.absolute_diff != null && Math.abs(c.absolute_diff) > 1e-9
  )
  if (!changed) return 'NO_MEASURABLE_CHANGE'
  return 'INCONCLUSIVE'
}
