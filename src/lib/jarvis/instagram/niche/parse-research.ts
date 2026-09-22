/**
 * Deterministic extraction of public Reel/creator references from web research text.
 * Prefer metadata + snippets. Never invent view counts.
 */

import { createHash } from 'crypto'
import { inferGeography, inferNiche } from '@/lib/jarvis/instagram/niche/segments'
import { classifyVirality, parseMetric } from '@/lib/jarvis/instagram/niche/virality'
import type {
  ReelAnalysis,
  ResearchSourceMeta,
  ViralReelRef,
  GeographyScope,
  FitnessNiche,
} from '@/lib/jarvis/instagram/niche/types'

export function fingerprintUrl(url: string): string {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex').slice(0, 24)
}

function extractHandle(text: string): string | null {
  const m = text.match(/@([A-Za-z0-9._]{2,30})/)
  return m ? `@${m[1]}` : null
}

function extractHook(text: string): string | null {
  const q = text.match(/[“"]([^”"]{8,120})[”"]/)
  if (q) return q[1]
  if (/\?/.test(text)) {
    const sentence = text.split(/[.!]/).find((s) => s.includes('?'))
    if (sentence) return sentence.trim().slice(0, 120)
  }
  return null
}

/**
 * Analyze observable textual evidence only — no fake FPS/cut claims.
 */
export function analyzeReelFromText(text: string): ReelAnalysis {
  const t = text.toLowerCase()
  const evidence: string[] = []
  const unsupported: string[] = []

  const hook = extractHook(text)
  if (hook) evidence.push(`Observed hook/question phrasing: "${hook.slice(0, 80)}"`)

  const opening = /\?|why you're|stop doing|mistake|secret/.test(t)
    ? 'Opens with a direct question or problem statement (from text evidence)'
    : null
  if (opening) evidence.push(opening)

  unsupported.push(
    'Frame-level cut rate / FPS editing claims are UNSUPPORTED without video analysis'
  )

  return {
    hook,
    topic: inferNiche(text),
    angle: /myth|debunk/.test(t)
      ? 'myth_correction'
      : /transform/.test(t)
        ? 'transformation'
        : /beginner/.test(t)
          ? 'beginner_education'
          : null,
    format: /reel|short.?form|9:16/.test(t) ? 'reel' : 'unknown',
    length_note: null,
    opening_structure: opening,
    pacing: null, // do not invent
    caption_style: /caption/.test(t) ? 'caption mentioned in source' : null,
    text_overlays: /text overlay|on.?screen text/.test(t) ? 'text overlays mentioned' : null,
    cta: /link in bio|dm me|comment|coaching/.test(t) ? 'CTA language present in description' : null,
    content_pillar: inferNiche(text),
    emotional_frame: /fear|shame|hope|motivat/.test(t) ? 'emotional framing words observed' : null,
    educational_value: /how to|mistake|tip|guide|explain/.test(t) ? 'educational language observed' : null,
    story_structure: /story|journey|before.?after/.test(t) ? 'story/transformation framing observed' : null,
    visual_structure: null,
    evidence_notes: evidence,
    unsupported_claims: unsupported,
  }
}

export function reelRefFromResearchHit(input: {
  title: string
  url: string
  description: string
  domain: string
  retrieved_at: string
  geography?: GeographyScope
  niche?: FitnessNiche | string
  observation_window?: string
  multi_source?: boolean
}): ViralReelRef {
  const blob = `${input.title}\n${input.description}`
  const views = parseMetric(
    blob.match(/([\d.,]+[kmb]?)\s*views?/i)?.[1] ?? 'UNAVAILABLE'
  )
  const likes = parseMetric(
    blob.match(/([\d.,]+[kmb]?)\s*likes?/i)?.[1] ?? 'UNAVAILABLE'
  )
  const comments = parseMetric(
    blob.match(/([\d.,]+[kmb]?)\s*comments?/i)?.[1] ?? 'UNAVAILABLE'
  )
  const viral = classifyVirality({
    views,
    likes,
    comments,
    follower_count: 'UNAVAILABLE',
    mentioned_as_viral: /viral|trending|blowing up|exploding/i.test(blob),
    multi_source: input.multi_source,
    recent_acceleration_mentioned: /rapid|overnight|this week|exploding/i.test(blob),
  })

  const geo = input.geography || inferGeography(blob)
  const niche = input.niche || inferNiche(blob)
  const analysis = analyzeReelFromText(blob)

  return {
    fingerprint: fingerprintUrl(input.url),
    creator_handle: extractHandle(blob),
    creator_profile_url: null,
    source_url: input.url,
    content_url: /instagram\.com/.test(input.url) ? input.url : null,
    title: input.title.slice(0, 300),
    caption: input.description.slice(0, 500) || null,
    published_at: null,
    observed_views: views,
    observed_likes: likes,
    observed_comments: comments,
    content_type: 'reel',
    topic: typeof niche === 'string' ? niche : niche,
    hook: analysis.hook,
    format: analysis.format,
    duration_sec: null,
    niche,
    geography: geo,
    discovery_method: 'WEB_RESEARCH',
    virality_basis: viral.bases,
    confidence: viral.confidence,
    limitations: [
      ...viral.limitations,
      'Discovered via WEB_RESEARCH (Brave snippets) — not Instagram Graph API for third-party accounts',
      'INSTAGRAM_GRAPH_API external creator media: UNSUPPORTED in this phase',
    ],
    analysis,
    tags: [String(niche), geo, 'phase8'],
    observation_window: input.observation_window || null,
    source_name: input.domain || 'web',
    source_type: /instagram\.com/.test(input.url) ? 'PLATFORM' : 'SECONDARY',
    retrieved_at: input.retrieved_at,
  }
}

export function sourceMetaFromHit(input: {
  title: string
  url: string
  domain: string
  retrieved_at: string
}): ResearchSourceMeta {
  return {
    source_url: input.url,
    source_name: input.domain || input.title.slice(0, 80),
    published_at: null,
    retrieved_at: input.retrieved_at,
    source_type: /instagram\.com/.test(input.url) ? 'PLATFORM' : 'SECONDARY',
    confidence: 0.4,
    discovery_method: 'WEB_RESEARCH',
  }
}
