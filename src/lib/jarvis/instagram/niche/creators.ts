/**
 * Creator profile analysis via WEB_RESEARCH — not private Graph access.
 */

import { createHash } from 'crypto'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { isBraveSearchConfigured, braveWebSearch } from '@/lib/jarvis/research/brave-search'
import { inferGeography, inferNiche } from '@/lib/jarvis/instagram/niche/segments'
import { parseMetric } from '@/lib/jarvis/instagram/niche/virality'
import { saveCreatorProfile } from '@/lib/jarvis/instagram/niche/store'
import type { CreatorProfile, GeographyScope } from '@/lib/jarvis/instagram/niche/types'

function normalizeHandle(h: string): string {
  const t = h.trim()
  if (t.startsWith('@')) return t
  if (/instagram\.com\//i.test(t)) {
    const m = t.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
    if (m) return `@${m[1]}`
  }
  return `@${t.replace(/^@/, '')}`
}

export async function analyzeCreator(input: {
  handle: string
  sample_size?: number
  observation_window?: string
  actorId?: string | null
  maxBudgetUsd?: number
}): Promise<{
  ok: boolean
  status: string
  profile: CreatorProfile | null
  spent_usd: number
  note: string
}> {
  const handle = normalizeHandle(input.handle)
  const sample = Math.min(Math.max(input.sample_size ?? 20, 5), 30)
  const window = input.observation_window || 'last 20 posts / public web sample'

  if (!isBraveSearchConfigured()) {
    return {
      ok: false,
      status: 'NOT_CONFIGURED',
      profile: null,
      spent_usd: 0,
      note: 'Brave Search not configured — cannot research public creator patterns',
    }
  }

  const gate = await assertAiBudgetAvailable(Math.min(input.maxBudgetUsd ?? 0.12, 0.25))
  if (!gate.ok) {
    return {
      ok: false,
      status: 'PAUSED_BUDGET',
      profile: null,
      spent_usd: 0,
      note: gate.reason,
    }
  }

  const q = `${handle} Instagram fitness creator Reels content style hooks`
  const search = await braveWebSearch(q, { count: 8 })
  await recordCostUsage({
    category: 'research',
    toolName: 'instagram.analyze_creator',
    costUsd: search.costUsd,
    metadata: { handle },
  })

  if (!search.ok) {
    return {
      ok: false,
      status: search.error_code || 'failed',
      profile: null,
      spent_usd: search.costUsd,
      note: search.error || 'search failed',
    }
  }

  const blob = search.results.map((r) => `${r.title} ${r.description}`).join('\n')
  const geography: GeographyScope = inferGeography(blob + handle)
  const niche = inferNiche(blob)
  const followers = parseMetric(
    blob.match(/([\d.,]+[kmb]?)\s*followers?/i)?.[1] ?? 'UNAVAILABLE'
  )

  const pillars: string[] = []
  if (/fat.?loss|weight/.test(blob.toLowerCase())) pillars.push('FAT_LOSS')
  if (/muscle|hypertrophy/.test(blob.toLowerCase())) pillars.push('MUSCLE_GAIN')
  if (/nutrition|diet|protein/.test(blob.toLowerCase())) pillars.push('NUTRITION')
  if (/beginner/.test(blob.toLowerCase())) pillars.push('BEGINNER_FITNESS')
  if (!pillars.length) pillars.push(String(niche))

  const hooks: string[] = []
  if (/\?/.test(blob)) hooks.push('question_hooks_mentioned')
  if (/mistake|wrong|stop/.test(blob.toLowerCase())) hooks.push('mistake_correction')
  if (/transform/.test(blob.toLowerCase())) hooks.push('transformation')

  const profile: CreatorProfile = {
    fingerprint: createHash('sha256').update(handle.toLowerCase()).digest('hex').slice(0, 24),
    handle,
    profile_url: `https://www.instagram.com/${handle.replace(/^@/, '')}/`,
    platform: 'instagram',
    niche: String(niche),
    geography,
    follower_count: followers,
    observed_posting_frequency: null, // do not invent
    recent_content_count: null,
    content_pillars: pillars,
    formats: ['reel'],
    recurring_hooks: hooks,
    cta_patterns: /link in bio|coaching|dm/i.test(blob) ? ['soft_cta_mentioned'] : [],
    visible_engagement: 'UNAVAILABLE',
    notable_patterns: [
      `Most frequently mentioned themes in WEB_RESEARCH sample: ${pillars.join(', ')}`,
    ],
    sample_size: Math.min(sample, search.results.length),
    observation_window: window,
    data_available: ['web_snippets', 'public_urls'],
    data_unavailable: [
      'exact_posting_frequency',
      'private_insights',
      'third_party_graph_media',
      followers === 'UNAVAILABLE' ? 'follower_count' : '',
      'engagement_metrics',
    ].filter(Boolean),
    limitations: [
      'WEB_RESEARCH only — INSTAGRAM_GRAPH_API for third-party creators UNSUPPORTED',
      'Do not treat as private analytics',
      `Requested sample ${sample}; web hits ${search.results.length}`,
    ],
    discovery_method: 'WEB_RESEARCH',
    retrieved_at: search.retrieved_at || new Date().toISOString(),
  }

  try {
    const saved = await saveCreatorProfile(profile)
    profile.id = saved.id
  } catch {
    /* offline */
  }

  return {
    ok: true,
    status: 'completed',
    profile,
    spent_usd: search.costUsd,
    note: `Creator report for ${handle} from public web sample. Neutral pattern language only.`,
  }
}

export function compareCreators(profiles: CreatorProfile[]): {
  comparison: {
    handle: string
    pillars: string[]
    formats: string[]
    hooks: string[]
    follower_count: string
    sample_size: number
    geography: string
  }[]
  note: string
} {
  return {
    comparison: profiles.map((p) => ({
      handle: p.handle,
      pillars: p.content_pillars,
      formats: p.formats,
      hooks: p.recurring_hooks,
      follower_count: String(p.follower_count),
      sample_size: p.sample_size,
      geography: p.geography,
    })),
    note: 'Pattern discovery only — not a best-creator ranking.',
  }
}
