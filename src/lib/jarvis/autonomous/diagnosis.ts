/**
 * Evidence-layered diagnosis — never claim root cause without support.
 */

import type { DiagnosisLayer } from '@/lib/jarvis/autonomous/types'

export function emptyDiagnosis(): DiagnosisLayer {
  return { observed: [], inferred: [], uncertain: [], recommendation: [] }
}

export function buildDiagnosis(input: {
  observed: string[]
  inferred?: string[]
  uncertain?: string[]
  recommendation?: string[]
}): DiagnosisLayer {
  return {
    observed: [...input.observed],
    inferred: [...(input.inferred ?? [])],
    uncertain: [...(input.uncertain ?? [])],
    recommendation: [...(input.recommendation ?? [])],
  }
}

/** Forbid causal phrasing in inferred/recommendation lines. */
export function containsCausalClaim(text: string): boolean {
  return /\b(caused|cause of|root cause is|proves that|definitely due to)\b/i.test(text)
}

export function formatDiagnosisExplanation(d: DiagnosisLayer): string {
  const lines: string[] = []
  if (d.observed.length) {
    lines.push('OBSERVED:')
    for (const o of d.observed) lines.push(`- ${o}`)
  }
  if (d.inferred.length) {
    lines.push('INFERENCE:')
    for (const o of d.inferred) lines.push(`- ${o}`)
  }
  if (d.uncertain.length) {
    lines.push('UNCERTAIN:')
    for (const o of d.uncertain) lines.push(`- ${o}`)
  }
  if (d.recommendation.length) {
    lines.push('RECOMMENDATION:')
    for (const o of d.recommendation) lines.push(`- ${o}`)
  }
  return lines.join('\n')
}

export function assertNoUnsupportedRootCause(d: DiagnosisLayer): boolean {
  for (const line of [...d.inferred, ...d.recommendation]) {
    if (containsCausalClaim(line) && !d.observed.some((o) => /experiment|controlled|a\/b/i.test(o))) {
      return false
    }
  }
  return true
}
