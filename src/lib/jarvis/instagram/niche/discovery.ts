/**
 * Viral Reel + trend discovery via Brave WEB_RESEARCH.
 * External Instagram Graph for third parties = UNSUPPORTED.
 */

import { createHash } from 'crypto'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { isBraveSearchConfigured, braveWebSearch } from '@/lib/jarvis/research/brave-search'
import { runObjectiveResearch } from '@/lib/jarvis/research/research-agent'
import {
  inferGeography,
  inferNiche,
  windowHoursFromLabel,
  windowLabel,
} from '@/lib/jarvis/instagram/niche/segments'
import {
  reelRefFromResearchHit,
  sourceMetaFromHit,
} from '@/lib/jarvis/instagram/niche/parse-research'
import {
  extractHookPatterns,
  extractTopicPatterns,
  extractRepetitionSignals,
  detectContentGaps,
  trendSignalsFromPatterns,
} from '@/lib/jarvis/instagram/niche/patterns'
import { generateOpportunities } from '@/lib/jarvis/instagram/niche/opportunities'
import {
  saveViralReels,
  saveTrendReport,
  findCachedTrendReport,
  listOwnRecentTopics,
} from '@/lib/jarvis/instagram/niche/store'
import type {
  GeographyScope,
  FitnessNiche,
  TrendReport,
  ViralReelRef,
} from '@/lib/jarvis/instagram/niche/types'

export function externalInstagramGraphCapability(): {
  status: 'UNSUPPORTED'
  note: string
} {
  return {
    status: 'UNSUPPORTED',
    note: 'Third-party Instagram Graph / Explore / hashtag scrape is UNSUPPORTED. Use WEB_RESEARCH (Brave) for public niche intelligence. Own-account Graph remains via instagram.sync_content.',
  }
}

export async function findViralReels(input: {
  query?: string
  niche?: FitnessNiche | string
  geography?: GeographyScope
  window?: string
  limit?: number
  actorId?: string | null
  maxBudgetUsd?: number
  forceRefresh?: boolean
}): Promise<{
  ok: boolean
  status: string
  data_status: 'verified' | 'partial' | 'unavailable' | 'failed'
  discovery_method: 'WEB_RESEARCH' | 'CACHE'
  reels: ViralReelRef[]
  sources: ReturnType<typeof sourceMetaFromHit>[]
  spent_usd: number
  observation_window: string
  geography: GeographyScope
  niche: string
  limitations: string[]
  note: string
}> {
  const windowHours = windowHoursFromLabel(input.window || '7 days')
  const observation_window = windowLabel(windowHours)
  const geography: GeographyScope =
    input.geography ||
    (input.query ? inferGeography(input.query) : 'GLOBAL') ||
    'GLOBAL'
  const niche = input.niche || (input.query ? inferNiche(input.query) : 'GENERAL_FITNESS')
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 25)

  const limitations = [
    externalInstagramGraphCapability().note,
    'Never invent metrics — UNAVAILABLE stays UNAVAILABLE',
  ]

  if (!isBraveSearchConfigured()) {
    return {
      ok: false,
      status: 'NOT_CONFIGURED',
      data_status: 'unavailable',
      discovery_method: 'WEB_RESEARCH',
      reels: [],
      sources: [],
      spent_usd: 0,
      observation_window,
      geography,
      niche: String(niche),
      limitations: [...limitations, 'BRAVE_SEARCH_API_KEY not configured'],
      note: 'WEB_RESEARCH not configured',
    }
  }

  const gate = await assertAiBudgetAvailable(Math.min(input.maxBudgetUsd ?? 0.2, 0.35))
  if (!gate.ok) {
    return {
      ok: false,
      status: 'PAUSED_BUDGET',
      data_status: 'unavailable',
      discovery_method: 'WEB_RESEARCH',
      reels: [],
      sources: [],
      spent_usd: 0,
      observation_window,
      geography,
      niche: String(niche),
      limitations,
      note: gate.reason,
    }
  }

  const geoPhrase = geography === 'INDIA' ? 'India Indian' : geography === 'GLOBAL' ? 'global' : ''
  const q =
    input.query?.trim() ||
    `viral fitness Instagram Reels ${String(niche).replace(/_/g, ' ')} ${geoPhrase} ${observation_window}`.trim()

  const search = await braveWebSearch(q, { count: Math.min(limit, 15) })
  await recordCostUsage({
    category: 'research',
    toolName: 'instagram.find_viral_reels',
    costUsd: search.costUsd,
    metadata: { discovery_method: 'WEB_RESEARCH', query: q.slice(0, 120) },
  })

  if (!search.ok) {
    return {
      ok: false,
      status: search.error_code === 'not_configured' ? 'NOT_CONFIGURED' : 'failed',
      data_status: 'unavailable',
      discovery_method: 'WEB_RESEARCH',
      reels: [],
      sources: [],
      spent_usd: search.costUsd,
      observation_window,
      geography,
      niche: String(niche),
      limitations: [...limitations, search.error || 'search failed'],
      note: search.error || 'search failed',
    }
  }

  const retrieved_at = search.retrieved_at || new Date().toISOString()
  const reels = search.results.slice(0, limit).map((r) =>
    reelRefFromResearchHit({
      title: r.title,
      url: r.url,
      description: r.description,
      domain: r.domain,
      retrieved_at,
      geography,
      niche,
      observation_window,
      multi_source: search.results.length >= 3,
    })
  )
  const sources = search.results.slice(0, limit).map((r) =>
    sourceMetaFromHit({
      title: r.title,
      url: r.url,
      domain: r.domain,
      retrieved_at,
    })
  )

  try {
    await saveViralReels(reels)
  } catch {
    // persistence optional for offline
  }

  const unavailableViews = reels.filter((r) => r.observed_views === 'UNAVAILABLE').length

  return {
    ok: true,
    status: 'completed',
    data_status: unavailableViews === reels.length ? 'partial' : 'partial',
    discovery_method: 'WEB_RESEARCH',
    reels,
    sources,
    spent_usd: search.costUsd,
    observation_window,
    geography,
    niche: String(niche),
    limitations: [
      ...limitations,
      `Public Reel view data UNAVAILABLE for ${unavailableViews}/${reels.length} references`,
    ],
    note: `Found ${reels.length} public references via WEB_RESEARCH. Not a virality guarantee.`,
  }
}

export async function researchNicheTrends(input: {
  niche?: FitnessNiche | string
  geography?: GeographyScope
  window?: string
  question?: string
  actorId?: string | null
  maxBudgetUsd?: number
  forceRefresh?: boolean
  includeOpportunities?: boolean
  business_objective?: string | null
  taste_notes?: string[]
  audience_signal?: string[]
  footage_available?: string[]
}): Promise<{
  ok: boolean
  status: string
  report: TrendReport | null
  spent_usd: number
  note: string
}> {
  const windowHours = windowHoursFromLabel(input.window || '7 days')
  const observation_window = windowLabel(windowHours)
  const geography: GeographyScope = input.geography || 'INDIA'
  const niche = input.niche || 'FAT_LOSS'

  if (!input.forceRefresh) {
    const cached = await findCachedTrendReport({
      niche: String(niche),
      geography,
      window_hours: windowHours,
      maxAgeHours: windowHours <= 24 ? 6 : 24,
    }).catch(() => null)
    if (cached) {
      return {
        ok: true,
        status: 'reused',
        report: cached,
        spent_usd: 0,
        note: 'Reused cached trend report (freshness window).',
      }
    }
  }

  const viral = await findViralReels({
    niche,
    geography,
    window: observation_window,
    limit: 15,
    actorId: input.actorId,
    maxBudgetUsd: Math.min(input.maxBudgetUsd ?? 0.25, 0.3),
  })

  let spent = viral.spent_usd
  let researchId: string | null = null

  // Optional deeper synthesis via research agent (bounded)
  if (viral.ok && isBraveSearchConfigured()) {
    const gate = await assertAiBudgetAvailable(0.15)
    if (gate.ok) {
      const research = await runObjectiveResearch({
        objective: `Fitness niche trend synthesis (${niche}, ${geography})`,
        decisionContext:
          'Phase 8 niche intelligence. Separate OBSERVED vs INFERENCE. No virality guarantees. Prefer public sources.',
        question:
          input.question ||
          `What fitness Instagram Reel hooks, topics, and formats are publicly discussed for ${String(niche).replace(/_/g, ' ')} in ${geography} over the last ${observation_window}?`,
        maxCostUsd: 0.2,
        maxSearches: 4,
        maxSources: 8,
        actorId: input.actorId,
        forceRefresh: input.forceRefresh,
      })
      spent += research.spent_usd
      // research id may not be returned — leave null
      if (research.status === 'stopped_budget') {
        // keep viral-only report
      }
    }
  }

  const reels = viral.reels
  const hook_patterns = extractHookPatterns(reels, observation_window, geography)
  const top_topics = extractTopicPatterns(reels, observation_window, geography)
  const format_patterns: TrendReport['format_patterns'] = [
    {
      kind: 'OBSERVED_PATTERN',
      label: 'reel',
      count: reels.filter((r) => r.content_type === 'reel' || r.format === 'reel').length,
      sample_size: reels.length,
      statement: `Reel format references: observed count in sample (not causal).`,
      window: observation_window,
      geography,
    },
  ]
  const repetition_signals = extractRepetitionSignals(reels, reels.length)
  const { emerging, uncertain } = trendSignalsFromPatterns(hook_patterns, windowHours, geography)

  let ownTopics: string[] = []
  try {
    ownTopics = await listOwnRecentTopics(60)
  } catch {
    ownTopics = []
  }
  const content_gaps = detectContentGaps({
    externalTopics: top_topics.map((t) => ({ topic: t.label, count: t.count })),
    ownRecentTopics: ownTopics,
    ownWindowDays: 60,
  })

  const opportunities = input.includeOpportunities !== false
    ? generateOpportunities({
        reels,
        business_objective: input.business_objective,
        taste_notes: input.taste_notes,
        audience_signal: input.audience_signal,
        footage_available: input.footage_available,
        geography,
        niche: String(niche),
      }).map((o) => o.title)
    : []

  const fingerprint = createHash('sha256')
    .update([String(niche), geography, observation_window, String(reels.length)].join('|'))
    .digest('hex')
    .slice(0, 24)

  const report: TrendReport = {
    fingerprint,
    scope: `fitness:${niche}:${geography}`,
    geography,
    niche: String(niche),
    observation_window,
    window_hours: windowHours,
    creators_analyzed: new Set(reels.map((r) => r.creator_handle).filter(Boolean)).size,
    reels_analyzed: reels.length,
    top_topics,
    hook_patterns,
    format_patterns,
    content_gaps,
    repetition_signals,
    emerging_signals: emerging,
    uncertain_signals: uncertain,
    sources: viral.sources,
    opportunities,
    claim_kind: 'OBSERVED_PATTERN',
    discovery_method: 'WEB_RESEARCH',
    limitations: [
      ...viral.limitations,
      reels.length < 5 ? 'Insufficient sample — treat patterns as UNCERTAIN' : null,
      researchId ? null : 'Deep research synthesis optional',
    ].filter(Boolean) as string[],
    spent_usd: spent,
    status: viral.ok ? 'completed' : viral.status,
  }

  try {
    const saved = await saveTrendReport(report)
    report.id = saved.id
  } catch {
    /* offline */
  }

  return {
    ok: viral.ok || reels.length > 0,
    status: report.status,
    report,
    spent_usd: spent,
    note:
      reels.length < 5
        ? 'Sample too small for strong claims — patterns marked carefully.'
        : `Trend report from ${reels.length} WEB_RESEARCH references (${observation_window}, ${geography}).`,
  }
}
