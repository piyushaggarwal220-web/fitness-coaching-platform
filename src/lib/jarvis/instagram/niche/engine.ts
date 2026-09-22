/**
 * Phase 8 orchestration: niche intel + own account + taste + footage → opportunities → CD handoff.
 */

import { researchNicheTrends, findViralReels } from '@/lib/jarvis/instagram/niche/discovery'
import { analyzeCreator, compareCreators } from '@/lib/jarvis/instagram/niche/creators'
import {
  generateOpportunities,
  matchTrendToTaste,
  matchTrendToFootage,
  matchTrendToBusiness,
} from '@/lib/jarvis/instagram/niche/opportunities'
import { saveOpportunities, listOpportunities, listWatchlists } from '@/lib/jarvis/instagram/niche/store'
import { retrieveTaste, effectsFromRetrievedTaste } from '@/lib/jarvis/taste'
import { analyzeInstagramPerformance } from '@/lib/jarvis/instagram/intelligence'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GeographyScope, FitnessNiche, ContentOpportunity } from '@/lib/jarvis/instagram/niche/types'

export async function generateNicheOpportunities(input: {
  niche?: FitnessNiche | string
  geography?: GeographyScope
  window?: string
  business_objective?: string | null
  session_id?: string | null
  actorId?: string | null
  forceRefresh?: boolean
}): Promise<{
  ok: boolean
  status: string
  opportunities: ContentOpportunity[]
  report_id: string | null
  presentation: {
    OBSERVED: string[]
    AUDIENCE_SIGNAL: string[]
    YOUR_TASTE: string[]
    FOOTAGE: string[]
    CONTENT_OPPORTUNITY: string[]
    WHY: string[]
    LIMITATIONS: string[]
  }
  spent_usd: number
  note: string
}> {
  const geography = input.geography || 'INDIA'
  const niche = input.niche || 'FAT_LOSS'
  const business =
    input.business_objective || 'LURVOX awareness + coaching lead generation'

  // Taste
  let taste_notes: string[] = []
  try {
    const taste = await retrieveTaste({
      platform: 'instagram',
      format: 'reel',
      pillar: String(niche),
      objective: business,
    })
    const effects = effectsFromRetrievedTaste(taste)
    taste_notes = effects.preferences_applied
    if (effects.minimal_zooms) taste_notes.push('restrained zooms')
    if (effects.reduce_overlays) taste_notes.push('minimal captions/overlays')
  } catch {
    taste_notes = []
  }

  // Own-account audience signal (first-party)
  const audience_signal: string[] = []
  try {
    const perf = await analyzeInstagramPerformance({ days: 30, writeMemory: false })
    if (perf.data_status === 'verified' || perf.data_status === 'partial') {
      const v = perf.value as {
        by_format?: { format: string; median_interactions?: number | null }[]
        sample_size?: number
        notes?: string[]
      }
      if (v.by_format?.length) {
        for (const f of v.by_format.slice(0, 3)) {
          if (f.median_interactions != null) {
            audience_signal.push(
              `AUDIENCE_SIGNAL: ${f.format} median interactions ${f.median_interactions} in own-account sample (n≈${v.sample_size ?? '?'})`
            )
          }
        }
      }
      if (!audience_signal.length) {
        audience_signal.push(
          'AUDIENCE_SIGNAL: insufficient verified own-account format sample — no fabricated rates'
        )
      }
    } else {
      audience_signal.push('AUDIENCE_SIGNAL: own-account performance unavailable or partial')
    }
  } catch {
    audience_signal.push('AUDIENCE_SIGNAL: own-account analysis failed/unavailable')
  }

  // Footage from Phase 4 session if provided
  const footage_available: string[] = []
  const missing_footage: string[] = []
  if (input.session_id) {
    try {
      const admin = createAdminClient()
      const { data: segs } = await admin
        .from('jarvis_video_segments')
        .select('label, kind, summary')
        .eq('session_id', input.session_id)
        .limit(30)
      for (const s of segs ?? []) {
        footage_available.push(
          [s.kind, s.label, s.summary].filter(Boolean).join(': ').slice(0, 120)
        )
      }
      if (!footage_available.length) {
        missing_footage.push('NEW_RECORDING_REQUIRED: no segments on session')
      }
    } catch {
      missing_footage.push('Footage lookup unavailable')
    }
  }

  const trends = await researchNicheTrends({
    niche,
    geography,
    window: input.window || '7 days',
    actorId: input.actorId,
    forceRefresh: input.forceRefresh,
    includeOpportunities: false,
    business_objective: business,
    taste_notes,
    audience_signal,
    footage_available,
  })

  const footageMatch = matchTrendToFootage({
    trend_topic: String(niche),
    available_segments: footage_available,
  })
  if (footageMatch.status === 'NEW_RECORDING_REQUIRED') {
    missing_footage.push(...footageMatch.missing)
  }

  const tasteMatch = matchTrendToTaste({
    trend_editing_style: 'fast-cut educational Reel',
    taste_notes,
  })
  const biz = matchTrendToBusiness({
    trend_topic: String(niche),
    business_objective: business,
  })

  const opportunities = generateOpportunities({
    trend_report: trends.report,
    reels: [],
    business_objective: business,
    taste_notes: [...taste_notes, tasteMatch.adapted],
    audience_signal,
    footage_available: footageMatch.usable.length ? footageMatch.usable : footage_available,
    missing_footage,
    geography,
    niche: String(niche),
  }).map((o) => ({
    ...o,
    claim_separation: {
      ...o.claim_separation,
      RECOMMENDATION: [
        ...o.claim_separation.RECOMMENDATION,
        biz.content_angle,
        tasteMatch.note,
      ],
    },
  }))

  try {
    await saveOpportunities(opportunities)
  } catch {
    /* offline */
  }

  const presentation = {
    OBSERVED: [
      trends.report
        ? `Across ${trends.report.reels_analyzed} public fitness references sampled (${trends.report.geography}, ${trends.report.observation_window}), top hook patterns: ${trends.report.hook_patterns
            .slice(0, 3)
            .map((p) => p.label)
            .join(', ') || 'n/a'}.`
        : 'No trend report available',
      ...(trends.report?.hook_patterns.slice(0, 2).map((p) => p.statement) || []),
    ],
    AUDIENCE_SIGNAL: audience_signal,
    YOUR_TASTE: taste_notes.length
      ? taste_notes
      : ['No active taste preferences retrieved'],
    FOOTAGE: footage_available.length
      ? footage_available.slice(0, 5)
      : missing_footage.length
        ? missing_footage
        : ['No session footage checked'],
    CONTENT_OPPORTUNITY: opportunities.map((o) => o.title),
    WHY: opportunities.slice(0, 1).flatMap((o) => [
      o.trend_relevance || '',
      o.business_alignment || '',
      `Fit: ${o.fit_level}`,
      ...Object.entries(o.scoring).map(([k, v]) => `${k}=${v.toFixed(2)}`),
    ]),
    LIMITATIONS: [
      ...(trends.report?.limitations || []),
      'No virality guarantees',
      'WEB_RESEARCH ≠ Instagram Graph third-party facts',
    ],
  }

  return {
    ok: trends.ok || opportunities.length > 0,
    status: trends.status,
    opportunities,
    report_id: trends.report?.id || null,
    presentation,
    spent_usd: trends.spent_usd,
    note: 'Opportunities ready for Creative Director handoff. Publish/render remain gated.',
  }
}

export async function handoffOpportunityToCreative(input: {
  opportunity_fingerprint: string
  session_id?: string
  actorId?: string | null
}): Promise<{ ok: boolean; note: string; creative?: unknown }> {
  const opps = await listOpportunities(50)
  const row = opps.find((o) => o.fingerprint === input.opportunity_fingerprint)
  if (!row) return { ok: false, note: 'Opportunity not found' }

  if (!input.session_id) {
    return {
      ok: true,
      note: 'Opportunity selected. Provide session_id to run creative.plan / planFromSession. Not published.',
    }
  }

  try {
    const { planFromSession } = await import('@/lib/jarvis/creative')
    const result = await planFromSession({
      session_id: input.session_id,
      idea: String(row.title),
      objective: 'LEAD',
      current_instruction: [
        ...(row.taste_notes || []),
        ...(row.originality_angles || []).slice(0, 3),
      ].join('; '),
      actorId: input.actorId,
      save: true,
    })
    return {
      ok: result.ok,
      note: `Handed to Creative Director. ${result.note}. Render/publish still gated.`,
      creative: result,
    }
  } catch (e) {
    return {
      ok: false,
      note: e instanceof Error ? e.message : 'Creative handoff failed',
    }
  }
}

export async function getNicheIntelligenceOverview() {
  const [watchlists, opps] = await Promise.all([
    listWatchlists().catch(() => []),
    listOpportunities(10).catch(() => []),
  ])
  let latestReport = null
  try {
    const { getLatestTrendReport } = await import('@/lib/jarvis/instagram/niche/store')
    latestReport = await getLatestTrendReport()
  } catch {
    latestReport = null
  }
  return {
    last_research_run: latestReport?.created_at || null,
    freshness: latestReport?.observation_window || null,
    scope: latestReport?.scope || null,
    geography: latestReport?.geography || null,
    sample_size: latestReport?.reels_analyzed ?? 0,
    limitations: latestReport?.limitations || [
      'No trend report yet — run Research Trends',
    ],
    watchlists: watchlists.length,
    opportunities: opps.length,
    external_graph: 'UNSUPPORTED',
    discovery_method: 'WEB_RESEARCH',
  }
}

export { findViralReels, researchNicheTrends, analyzeCreator, compareCreators }
