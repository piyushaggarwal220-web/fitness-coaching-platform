/**
 * Durable store for Phase 8 niche intelligence artifacts.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CreatorProfile,
  ContentOpportunity,
  TrendReport,
  ViralReelRef,
  Watchlist,
  GeographyScope,
} from '@/lib/jarvis/instagram/niche/types'

export async function saveViralReels(reels: ViralReelRef[]): Promise<number> {
  if (!reels.length) return 0
  const admin = createAdminClient()
  let n = 0
  for (const r of reels) {
    const { error } = await admin.from('jarvis_instagram_viral_reels').upsert(
      {
        fingerprint: r.fingerprint,
        creator_handle: r.creator_handle,
        creator_profile_url: r.creator_profile_url,
        source_url: r.source_url,
        content_url: r.content_url,
        title: r.title,
        caption: r.caption,
        published_at: r.published_at,
        observed_views: String(r.observed_views),
        observed_likes: String(r.observed_likes),
        observed_comments: String(r.observed_comments),
        content_type: r.content_type,
        topic: r.topic,
        hook: r.hook,
        format: r.format,
        duration_sec: r.duration_sec,
        niche: r.niche,
        geography: r.geography,
        discovery_method: r.discovery_method,
        virality_basis: r.virality_basis,
        confidence: r.confidence,
        limitations: r.limitations,
        analysis: r.analysis,
        tags: r.tags,
        observation_window: r.observation_window,
        source_name: r.source_name,
        source_type: r.source_type,
        retrieved_at: r.retrieved_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fingerprint' }
    )
    if (!error) n += 1
  }
  return n
}

export async function listViralReels(opts?: {
  niche?: string
  geography?: string
  limit?: number
}): Promise<ViralReelRef[]> {
  const admin = createAdminClient()
  let q = admin
    .from('jarvis_instagram_viral_reels')
    .select('*')
    .order('retrieved_at', { ascending: false })
    .limit(opts?.limit ?? 40)
  if (opts?.niche) q = q.eq('niche', opts.niche)
  if (opts?.geography) q = q.eq('geography', opts.geography)
  const { data } = await q
  return (data ?? []).map(rowToReel)
}

function rowToReel(row: Record<string, unknown>): ViralReelRef {
  const parseM = (v: unknown) => {
    if (v === 'UNAVAILABLE' || v == null) return 'UNAVAILABLE' as const
    const n = Number(v)
    return Number.isFinite(n) ? n : ('UNAVAILABLE' as const)
  }
  return {
    id: row.id as string,
    fingerprint: row.fingerprint as string,
    creator_handle: (row.creator_handle as string) || null,
    creator_profile_url: (row.creator_profile_url as string) || null,
    source_url: row.source_url as string,
    content_url: (row.content_url as string) || null,
    title: (row.title as string) || null,
    caption: (row.caption as string) || null,
    published_at: (row.published_at as string) || null,
    observed_views: parseM(row.observed_views),
    observed_likes: parseM(row.observed_likes),
    observed_comments: parseM(row.observed_comments),
    content_type: (row.content_type as string) || 'reel',
    topic: (row.topic as string) || null,
    hook: (row.hook as string) || null,
    format: (row.format as string) || null,
    duration_sec: row.duration_sec != null ? Number(row.duration_sec) : null,
    niche: (row.niche as string) || null,
    geography: (row.geography as GeographyScope) || 'UNKNOWN',
    discovery_method: row.discovery_method as ViralReelRef['discovery_method'],
    virality_basis: (row.virality_basis as ViralReelRef['virality_basis']) || [],
    confidence: Number(row.confidence || 0),
    limitations: (row.limitations as string[]) || [],
    analysis: (row.analysis as ViralReelRef['analysis']) || {
      hook: null,
      topic: null,
      angle: null,
      format: null,
      length_note: null,
      opening_structure: null,
      pacing: null,
      caption_style: null,
      text_overlays: null,
      cta: null,
      content_pillar: null,
      emotional_frame: null,
      educational_value: null,
      story_structure: null,
      visual_structure: null,
      evidence_notes: [],
      unsupported_claims: [],
    },
    tags: (row.tags as string[]) || [],
    observation_window: (row.observation_window as string) || null,
    source_name: (row.source_name as string) || null,
    source_type: (row.source_type as ViralReelRef['source_type']) || 'SECONDARY',
    retrieved_at: row.retrieved_at as string,
  }
}

export async function saveTrendReport(
  report: TrendReport
): Promise<{ id: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_instagram_trend_reports')
    .upsert(
      {
        fingerprint: report.fingerprint,
        scope: report.scope,
        geography: report.geography,
        niche: report.niche,
        observation_window: report.observation_window,
        window_hours: report.window_hours,
        creators_analyzed: report.creators_analyzed,
        reels_analyzed: report.reels_analyzed,
        top_topics: report.top_topics,
        hook_patterns: report.hook_patterns,
        format_patterns: report.format_patterns,
        content_gaps: report.content_gaps,
        repetition_signals: report.repetition_signals,
        emerging_signals: report.emerging_signals,
        uncertain_signals: report.uncertain_signals,
        sources: report.sources,
        opportunities: report.opportunities,
        claim_kind: report.claim_kind,
        discovery_method: report.discovery_method,
        limitations: report.limitations,
        spent_usd: report.spent_usd,
        status: report.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fingerprint' }
    )
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message || 'saveTrendReport failed')
  return { id: data.id }
}

export async function findCachedTrendReport(input: {
  niche: string
  geography: string
  window_hours: number
  maxAgeHours: number
}): Promise<TrendReport | null> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - input.maxAgeHours * 3600_000).toISOString()
  const { data } = await admin
    .from('jarvis_instagram_trend_reports')
    .select('*')
    .eq('niche', input.niche)
    .eq('geography', input.geography)
    .eq('window_hours', input.window_hours)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    fingerprint: data.fingerprint,
    scope: data.scope,
    geography: data.geography,
    niche: data.niche,
    observation_window: data.observation_window,
    window_hours: data.window_hours,
    creators_analyzed: data.creators_analyzed,
    reels_analyzed: data.reels_analyzed,
    top_topics: data.top_topics || [],
    hook_patterns: data.hook_patterns || [],
    format_patterns: data.format_patterns || [],
    content_gaps: data.content_gaps || [],
    repetition_signals: data.repetition_signals || [],
    emerging_signals: data.emerging_signals || [],
    uncertain_signals: data.uncertain_signals || [],
    sources: data.sources || [],
    opportunities: data.opportunities || [],
    claim_kind: data.claim_kind,
    discovery_method: data.discovery_method,
    limitations: data.limitations || [],
    spent_usd: Number(data.spent_usd || 0),
    status: data.status,
    created_at: data.created_at,
  }
}

export async function getLatestTrendReport(): Promise<TrendReport | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_instagram_trend_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return findCachedTrendReport({
    niche: data.niche,
    geography: data.geography,
    window_hours: data.window_hours,
    maxAgeHours: 24 * 30,
  })
}

export async function saveCreatorProfile(profile: CreatorProfile): Promise<{ id: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_instagram_creator_profiles')
    .upsert(
      {
        fingerprint: profile.fingerprint,
        handle: profile.handle,
        profile_url: profile.profile_url,
        platform: profile.platform,
        niche: profile.niche,
        geography: profile.geography,
        follower_count: String(profile.follower_count),
        observed_posting_frequency: profile.observed_posting_frequency,
        recent_content_count: profile.recent_content_count,
        content_pillars: profile.content_pillars,
        formats: profile.formats,
        recurring_hooks: profile.recurring_hooks,
        cta_patterns: profile.cta_patterns,
        visible_engagement: String(profile.visible_engagement),
        notable_patterns: profile.notable_patterns,
        sample_size: profile.sample_size,
        observation_window: profile.observation_window,
        data_available: profile.data_available,
        data_unavailable: profile.data_unavailable,
        limitations: profile.limitations,
        discovery_method: profile.discovery_method,
        report: profile,
        retrieved_at: profile.retrieved_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fingerprint' }
    )
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message || 'saveCreator failed')
  return { id: data.id }
}

export async function saveOpportunities(opps: ContentOpportunity[]): Promise<number> {
  const admin = createAdminClient()
  let n = 0
  for (const o of opps) {
    const { error } = await admin.from('jarvis_instagram_content_opportunities').upsert(
      {
        fingerprint: o.fingerprint,
        title: o.title,
        observed: o.observed,
        audience_signal: o.audience_signal,
        taste_notes: o.taste_notes,
        footage_notes: o.footage_notes,
        missing_footage: o.missing_footage,
        business_alignment: o.business_alignment,
        trend_relevance: o.trend_relevance,
        originality_angles: o.originality_angles,
        fit_level: o.fit_level,
        scoring: o.scoring,
        limitations: o.limitations,
        geography: o.geography,
        niche: o.niche,
        claim_separation: o.claim_separation,
        status: o.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fingerprint' }
    )
    if (!error) n += 1
  }
  return n
}

export async function listOpportunities(limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_instagram_content_opportunities')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function listOwnRecentTopics(days = 60): Promise<string[]> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
  const { data } = await admin
    .from('marketing_content')
    .select('title, topic, caption, creative_plan, created_at')
    .eq('platform', 'instagram')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(80)
  const topics: string[] = []
  for (const row of data ?? []) {
    if (row.topic) topics.push(String(row.topic))
    if (row.title) topics.push(String(row.title))
    const plan = row.creative_plan as { topic?: string; pillar?: string } | null
    if (plan?.topic) topics.push(plan.topic)
    if (plan?.pillar) topics.push(plan.pillar)
  }
  return topics
}

export async function upsertWatchlist(input: Watchlist & { actorId?: string | null }) {
  const admin = createAdminClient()
  if (input.id) {
    const { data, error } = await admin
      .from('jarvis_instagram_watchlists')
      .update({
        name: input.name,
        creators: input.creators,
        niches: input.niches,
        topics: input.topics,
        keywords: input.keywords,
        geographies: input.geographies,
        active: input.active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }
  const { data, error } = await admin
    .from('jarvis_instagram_watchlists')
    .insert({
      name: input.name,
      creators: input.creators,
      niches: input.niches,
      topics: input.topics,
      keywords: input.keywords,
      geographies: input.geographies,
      active: input.active,
      created_by: input.actorId || null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function listWatchlists() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_instagram_watchlists')
    .select('*')
    .eq('active', true)
    .order('updated_at', { ascending: false })
  return data ?? []
}
