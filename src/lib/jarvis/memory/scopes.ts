/**
 * Phase 3 memory scopes, statuses, evidence labels, confidence helpers.
 */

export type MemoryScope =
  | 'GLOBAL_BUSINESS'
  | 'FUNNEL'
  | 'CAMPAIGN'
  | 'AD_SET'
  | 'AD'
  | 'CREATIVE'
  | 'INSTAGRAM_ACCOUNT'
  | 'INSTAGRAM_MEDIA'
  | 'SHOPIFY'
  | 'PRODUCT'
  | 'VIDEO_STYLE'
  | 'USER_PREFERENCE'
  | 'RESEARCH_TOPIC'
  | 'EXPERIMENT'
  | 'TASK'
  | 'DECISION'

export type MemoryLifecycleStatus = 'ACTIVE' | 'STALE' | 'SUPERSEDED' | 'ARCHIVED'

export type EvidenceLabel =
  | 'OBSERVED'
  | 'TEMPORALLY_ASSOCIATED'
  | 'REPEATED_PATTERN'
  | 'SUPPORTED_HYPOTHESIS'
  | 'CAUSALITY_NOT_ESTABLISHED'

export type LearningConfidence = 'low' | 'medium' | 'high'

export type OutcomeState =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'NO_MEASURABLE_CHANGE'
  | 'UNDERPERFORMED'
  | 'INCONCLUSIVE'
  | 'UNAVAILABLE'
  | 'FAILED_ACTION'

export type MeasurementWindowHours = 24 | 48 | 72 | 168

/** Sample-size guidance — never equals causality. */
export function patternStrength(sampleSize: number): {
  label: 'isolated_observation' | 'emerging_pattern' | 'stronger_repeated_pattern'
  confidence: LearningConfidence
} {
  if (sampleSize <= 1) return { label: 'isolated_observation', confidence: 'low' }
  if (sampleSize <= 4) return { label: 'emerging_pattern', confidence: 'low' }
  return { label: 'stronger_repeated_pattern', confidence: 'medium' }
}

export function confidenceFromEvidence(input: {
  sampleSize: number
  consistent: boolean
  sourceReliable: boolean
  freshnessDays: number
}): LearningConfidence {
  let score = 0
  if (input.sampleSize >= 5) score += 2
  else if (input.sampleSize >= 2) score += 1
  if (input.consistent) score += 1
  if (input.sourceReliable) score += 1
  if (input.freshnessDays <= 14) score += 1
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

export function defaultWindowForTool(toolName: string): MeasurementWindowHours {
  if (toolName.startsWith('video.')) return 24
  if (toolName.startsWith('instagram.')) return 72
  if (toolName.startsWith('shopify.update_seo') || toolName.includes('seo')) return 168
  if (toolName.includes('budget') || toolName.startsWith('meta.')) return 48
  if (toolName.includes('creative') || toolName.includes('test')) return 72
  return 48
}

export function observationalStatement(input: {
  metric: string
  before: number | null
  after: number | null
  windowHours: number
  actionLabel: string
}): string {
  if (input.before == null || input.after == null) {
    return `${input.metric} could not be fully compared after "${input.actionLabel}" during the ${input.windowHours}h window.`
  }
  const direction = input.after > input.before ? 'increased' : input.after < input.before ? 'decreased' : 'was unchanged'
  return `${input.metric} ${direction} during the ${input.windowHours}-hour period following "${input.actionLabel}" (${input.before} → ${input.after}). Causality is not established.`
}
