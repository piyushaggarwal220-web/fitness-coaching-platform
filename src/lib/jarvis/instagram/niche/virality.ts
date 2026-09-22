/**
 * Virality criteria — never invent metrics; never call everything "viral".
 */

import type { MetricValue, ViralityBasis, ViralReelRef } from '@/lib/jarvis/instagram/niche/types'

export function parseMetric(raw: unknown): MetricValue {
  if (raw == null || raw === '' || raw === 'UNAVAILABLE') return 'UNAVAILABLE'
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/,/g, '').trim()
    if (/^(n\/?a|unavailable|unknown|null|-)$/i.test(cleaned)) return 'UNAVAILABLE'
    const m = cleaned.match(/^([\d.]+)\s*([kmb])?$/i)
    if (m) {
      let n = Number(m[1])
      const suf = (m[2] || '').toLowerCase()
      if (suf === 'k') n *= 1_000
      if (suf === 'm') n *= 1_000_000
      if (suf === 'b') n *= 1_000_000_000
      return Number.isFinite(n) ? n : 'UNAVAILABLE'
    }
  }
  return 'UNAVAILABLE'
}

/**
 * Determine virality_basis from available evidence.
 * CREATOR_RELATIVE requires follower denominator — otherwise INSUFFICIENT_DENOMINATOR.
 */
export function classifyVirality(input: {
  views: MetricValue
  likes: MetricValue
  comments: MetricValue
  follower_count?: MetricValue
  mentioned_as_viral?: boolean
  multi_source?: boolean
  recent_acceleration_mentioned?: boolean
}): { bases: ViralityBasis[]; confidence: number; limitations: string[] } {
  const bases: ViralityBasis[] = []
  const limitations: string[] = []

  if (input.views === 'UNAVAILABLE') {
    limitations.push('views = UNAVAILABLE (not 0)')
  } else if (typeof input.views === 'number' && input.views >= 100_000) {
    bases.push('ABSOLUTE_REACH')
  }

  if (input.likes === 'UNAVAILABLE') limitations.push('likes = UNAVAILABLE')
  if (input.comments === 'UNAVAILABLE') limitations.push('comments = UNAVAILABLE')

  if (
    typeof input.views === 'number' &&
    typeof input.likes === 'number' &&
    input.views > 0 &&
    input.likes / input.views >= 0.03
  ) {
    bases.push('ENGAGEMENT')
  }

  if (input.follower_count === 'UNAVAILABLE' || input.follower_count == null) {
    if (typeof input.views === 'number') {
      limitations.push(
        'CREATOR_RELATIVE not calculated — follower denominator unavailable'
      )
      bases.push('INSUFFICIENT_DENOMINATOR')
    }
  } else if (
    typeof input.views === 'number' &&
    typeof input.follower_count === 'number' &&
    input.follower_count > 0 &&
    input.views / input.follower_count >= 2
  ) {
    bases.push('CREATOR_RELATIVE')
  }

  if (input.recent_acceleration_mentioned) bases.push('RECENT_ACCELERATION')
  if (input.multi_source || input.mentioned_as_viral) bases.push('MULTI_SOURCE_TREND')

  // Deduplicate
  const uniq = [...new Set(bases)]
  const meaningful = uniq.filter((b) => b !== 'INSUFFICIENT_DENOMINATOR')
  if (!meaningful.length && input.mentioned_as_viral) {
    uniq.push('MULTI_SOURCE_TREND')
    limitations.push('Labeled viral by secondary web source only — metrics may be missing')
  }

  let confidence = 0.2
  if (meaningful.includes('ABSOLUTE_REACH')) confidence += 0.25
  if (meaningful.includes('CREATOR_RELATIVE')) confidence += 0.25
  if (meaningful.includes('ENGAGEMENT')) confidence += 0.15
  if (meaningful.includes('MULTI_SOURCE_TREND')) confidence += 0.1
  if (input.views === 'UNAVAILABLE') confidence = Math.min(confidence, 0.35)

  return {
    bases: uniq.length ? uniq : ['INSUFFICIENT_DENOMINATOR'],
    confidence: Math.min(1, confidence),
    limitations,
  }
}

export function metricDisplay(v: MetricValue): string {
  return v === 'UNAVAILABLE' ? 'UNAVAILABLE' : String(v)
}

export function assertNoFabricatedZero(reel: Pick<ViralReelRef, 'observed_views' | 'limitations'>) {
  if (reel.observed_views === 0 && reel.limitations.some((l) => /unavailable/i.test(l))) {
    return false
  }
  return true
}
