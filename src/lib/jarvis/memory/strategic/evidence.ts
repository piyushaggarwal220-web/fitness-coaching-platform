/**
 * Evidence helpers — never invent numeric zeros as "proof".
 */

import type { StrategicEvidenceItem, MemorySourceType } from '@/lib/jarvis/memory/strategic/types'
import type { StrategicConfidence } from '@/lib/jarvis/memory/scopes'
import { strategicConfidenceFromEvidence } from '@/lib/jarvis/memory/scopes'

export function buildEvidenceItem(input: {
  source_type: MemorySourceType
  source_id?: string | null
  observed_at?: string
  metric?: string | null
  before_value?: number | null
  after_value?: number | null
  window?: string | null
  sample_size?: number | null
  notes?: string | null
  sourceReliable?: boolean
}): StrategicEvidenceItem {
  const sample = input.sample_size ?? null
  const confidence: StrategicConfidence = strategicConfidenceFromEvidence({
    sampleSize: sample ?? 0,
    consistent: true,
    sourceReliable: input.sourceReliable ?? input.source_type !== 'RESEARCH',
    freshnessDays: 0,
  })
  return {
    source_type: input.source_type,
    source_id: input.source_id ?? null,
    observed_at: input.observed_at ?? new Date().toISOString(),
    metric: input.metric ?? null,
    before_value: input.before_value ?? null,
    after_value: input.after_value ?? null,
    window: input.window ?? null,
    sample_size: sample,
    confidence,
    notes: input.notes ?? null,
  }
}

export function evidenceLines(items: StrategicEvidenceItem[]): string[] {
  return items.map((e) => {
    const parts = [
      e.source_type,
      e.source_id ? `id=${e.source_id}` : null,
      e.metric ? `metric=${e.metric}` : null,
      e.before_value != null && e.after_value != null
        ? `${e.before_value}→${e.after_value}`
        : null,
      e.sample_size != null ? `n=${e.sample_size}` : null,
      e.window,
      e.notes,
    ].filter(Boolean)
    return parts.join(' · ')
  })
}

/** Pattern promotion threshold: isolated observation vs emerging pattern. */
export function canPromoteToPattern(sampleSize: number): boolean {
  return sampleSize >= 3
}

export function canPromoteToOperatingRule(input: {
  sampleSize: number
  confidence: StrategicConfidence
  source_type: MemorySourceType
}): boolean {
  if (input.source_type === 'USER_EXPLICIT') return true
  if (input.source_type === 'RESEARCH') return false
  return input.sampleSize >= 5 && (input.confidence === 'HIGH' || input.confidence === 'VERY_HIGH')
}
