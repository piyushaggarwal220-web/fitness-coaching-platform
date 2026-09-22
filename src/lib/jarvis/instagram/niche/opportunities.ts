/**
 * Content opportunities: trend + taste + footage + business + own audience.
 * No virality guarantees. Transparent scoring dimensions.
 */

import { createHash } from 'crypto'
import type {
  ContentOpportunity,
  GeographyScope,
  OriginalAngle,
  TrendReport,
  ViralReelRef,
} from '@/lib/jarvis/instagram/niche/types'
import { originalityFromTrend } from '@/lib/jarvis/instagram/niche/originality'
import { VIRALITY_GUARANTEE_FORBIDDEN } from '@/lib/jarvis/instagram/niche/types'

export type OpportunityInputs = {
  trend_report?: TrendReport | null
  reels?: ViralReelRef[]
  business_objective?: string | null
  taste_notes?: string[]
  audience_signal?: string[]
  footage_available?: string[]
  missing_footage?: string[]
  geography?: GeographyScope | null
  niche?: string | null
}

function scoreDimensions(input: OpportunityInputs): ContentOpportunity['scoring'] {
  const footage = input.footage_available?.length ?? 0
  const missing = input.missing_footage?.length ?? 0
  return {
    BUSINESS_ALIGNMENT: input.business_objective ? 0.8 : 0.4,
    FOOTAGE_AVAILABLE: footage === 0 ? 0.2 : missing > footage ? 0.4 : 0.85,
    AUDIENCE_SIGNAL: (input.audience_signal?.length ?? 0) > 0 ? 0.7 : 0.3,
    TREND_RELEVANCE: (input.reels?.length || input.trend_report?.reels_analyzed || 0) > 0 ? 0.75 : 0.3,
    TASTE_ALIGNMENT: (input.taste_notes?.length ?? 0) > 0 ? 0.8 : 0.5,
    ORIGINALITY: 0.85,
    EFFORT: missing > 2 ? 0.35 : 0.7,
  }
}

function fitFromScoring(s: ContentOpportunity['scoring']): ContentOpportunity['fit_level'] {
  const avg =
    (s.BUSINESS_ALIGNMENT +
      s.FOOTAGE_AVAILABLE +
      s.AUDIENCE_SIGNAL +
      s.TREND_RELEVANCE +
      s.TASTE_ALIGNMENT +
      s.ORIGINALITY +
      s.EFFORT) /
    7
  if (avg >= 0.7) return 'HIGH_FIT'
  if (avg >= 0.45) return 'MEDIUM_FIT'
  return 'LOW_FIT'
}

export function generateOpportunities(input: OpportunityInputs): ContentOpportunity[] {
  const topics =
    input.trend_report?.top_topics?.slice(0, 5).map((t) => t.label) ||
    [...new Set((input.reels || []).map((r) => String(r.topic || r.niche || 'fitness')))].slice(0, 5)

  if (!topics.length) {
    return []
  }

  const scoring = scoreDimensions(input)
  const fit = fitFromScoring(scoring)
  const out: ContentOpportunity[] = []

  for (const topic of topics.slice(0, 5)) {
    const original: OriginalAngle = originalityFromTrend({
      trend: topic,
      observed: `Repeated topic/pattern in sampled public references`,
      niche: input.niche,
      geography: input.geography || undefined,
    })

    const tasteAdapt =
      input.taste_notes?.length
        ? `Adapt editing to taste: ${input.taste_notes.slice(0, 3).join('; ')}`
        : 'No active taste preference applied'

    const title = `Original ${topic.replace(/_/g, ' ').toLowerCase()} Reel for LURVOX`
    const observed = [
      ...(input.trend_report?.hook_patterns.slice(0, 2).map((p) => p.statement) || []),
      `Topic ${topic} appeared in the observed sample.`,
    ]
    const recommendation = [
      `Create an original beginner-friendly Reel on ${topic.replace(/_/g, ' ')} using a problem-first hook.`,
      tasteAdapt,
      'Do not copy any creator script or near-clone their structure.',
      'This is based on observed patterns — not a virality prediction.',
    ]

    const textBlob = [...observed, ...recommendation].join(' ')
    if (VIRALITY_GUARANTEE_FORBIDDEN.test(textBlob)) {
      recommendation.push('Stripped forbidden virality guarantee language.')
    }

    const fp = createHash('sha256')
      .update([topic, input.geography || '', input.business_objective || '', fit].join('|'))
      .digest('hex')
      .slice(0, 24)

    out.push({
      fingerprint: fp,
      title,
      observed,
      audience_signal: input.audience_signal || [],
      taste_notes: input.taste_notes || [],
      footage_notes: input.footage_available || [],
      missing_footage: input.missing_footage || [],
      business_alignment: input.business_objective
        ? `Aligned to objective: ${input.business_objective}`
        : 'No explicit business objective provided',
      trend_relevance: `Trend topic ${topic} from sample (n=${input.trend_report?.reels_analyzed ?? input.reels?.length ?? 0})`,
      originality_angles: original.angles,
      fit_level: fit,
      scoring,
      limitations: [
        ...(input.trend_report?.limitations || []),
        'No virality guarantee',
        'External metrics may be UNAVAILABLE',
      ],
      geography: input.geography || null,
      niche: input.niche || topic,
      claim_separation: {
        OBSERVED: observed,
        INFERRED: [
          'Relevance to LURVOX audience is an inference from niche + business context.',
        ],
        RECOMMENDATION: recommendation,
      },
      status: 'candidate',
    })
  }

  return out
}

export function matchTrendToTaste(input: {
  trend_editing_style: string
  taste_notes: string[]
}): { adapted: string; note: string } {
  const taste = input.taste_notes.join(' ').toLowerCase()
  const restrained = /zoom|restrain|minimal|caption/.test(taste)
  if (restrained && /fast.?cut|aggressive|zoom/.test(input.trend_editing_style.toLowerCase())) {
    return {
      adapted:
        'Use the fast informational structure, but retain your restrained editing style (minimal zooms / taste-aligned captions).',
      note: 'Trend adapted to USER_TASTE — not copied as editing style.',
    }
  }
  return {
    adapted: `Apply trend idea while respecting taste: ${input.taste_notes.slice(0, 2).join('; ') || 'none specified'}`,
    note: 'Taste alignment check complete',
  }
}

export function matchTrendToFootage(input: {
  trend_topic: string
  available_segments: string[]
}): { usable: string[]; missing: string[]; status: 'ok' | 'NEW_RECORDING_REQUIRED' } {
  const topic = input.trend_topic.toLowerCase()
  const usable = input.available_segments.filter((s) => {
    const x = s.toLowerCase()
    if (/nutrition|meal|protein/.test(topic)) return /nutrition|meal|food|protein/.test(x)
    if (/fat.?loss|transform/.test(topic)) return /fat|transform|talking|gym/.test(x)
    if (/gym|form|lift/.test(topic)) return /gym|lift|form|squat|deadlift/.test(x)
    return /talking|gym|nutrition/.test(x)
  })
  const missing: string[] = []
  if (!usable.length) {
    missing.push(`NEW_RECORDING_REQUIRED: footage supporting "${input.trend_topic}"`)
    return { usable: [], missing, status: 'NEW_RECORDING_REQUIRED' }
  }
  return { usable, missing, status: 'ok' }
}

export function matchTrendToBusiness(input: {
  trend_topic: string
  business_objective: string
}): { content_angle: string; note: string } {
  const obj = input.business_objective.toLowerCase()
  if (/lead|₹99|funnel|coaching/.test(obj)) {
    return {
      content_angle: `Problem → solution → soft coaching CTA around ${input.trend_topic}`,
      note: 'Business objective: lead generation',
    }
  }
  if (/aware|brand|lurvox/.test(obj)) {
    return {
      content_angle: `Educational beginner Reel on ${input.trend_topic} for awareness`,
      note: 'Business objective: awareness',
    }
  }
  return {
    content_angle: `Educational Reel on ${input.trend_topic}`,
    note: 'Generic objective mapping',
  }
}
