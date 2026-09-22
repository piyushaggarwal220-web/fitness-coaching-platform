/**
 * Content opportunities + reel count estimation from analyzed footage.
 * Never invents source timestamps. Dedupes near-identical concepts.
 */

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ContentOpportunity,
  ConfidenceLevel,
  SourceMapping,
} from '@/lib/jarvis/video/intelligence/types'

function normalizeTopic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 8)
    .join(' ')
}

function dedupeKey(title: string, mappings: SourceMapping[]): string {
  const mapKey = mappings
    .map((m) => `${m.source_id}:${m.start.toFixed(1)}-${m.end.toFixed(1)}`)
    .sort()
    .join('|')
  return createHash('sha256')
    .update(`${normalizeTopic(title)}::${mapKey}`)
    .digest('hex')
    .slice(0, 24)
}

export async function buildOpportunitiesForSession(
  sessionId: string
): Promise<ContentOpportunity[]> {
  const admin = createAdminClient()
  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select('id')
    .eq('session_id', sessionId)
  const ids = (sources ?? []).map((s) => s.id)
  if (!ids.length) return []

  const { data: segments } = await admin
    .from('jarvis_video_segments')
    .select(
      'id, source_id, start_time, end_time, segment_type, classification_label, transcript_excerpt, confidence'
    )
    .in('source_id', ids)
    .eq('status', 'ACTIVE')
    .order('start_time', { ascending: true })

  const hooks = (segments ?? []).filter(
    (s) => s.classification_label === 'HOOK' || s.segment_type === 'HOOK'
  )
  const bodies = (segments ?? []).filter((s) =>
    ['EDUCATION', 'EXPLANATION', 'TIP', 'DEMONSTRATION', 'STORY'].includes(
      String(s.classification_label || s.segment_type)
    )
  )
  const ctas = (segments ?? []).filter(
    (s) => s.classification_label === 'CTA' || s.segment_type === 'CTA'
  )

  const opportunities: ContentOpportunity[] = []
  const usedKeys = new Set<string>()

  const seedHooks = hooks.length ? hooks : bodies.slice(0, 3)

  for (const hook of seedHooks.slice(0, 12)) {
    const hookText = String(hook.transcript_excerpt || '').trim()
    if (!hookText) continue

    const support = bodies
      .filter((b) => b.id !== hook.id)
      .filter((b) => {
        const t = String(b.transcript_excerpt || '').toLowerCase()
        const tokens = hookText
          .toLowerCase()
          .split(/\s+/)
          .filter((x) => x.length > 4)
        return tokens.some((tok) => t.includes(tok))
      })
      .slice(0, 2)

    const cta = ctas[0]
    const mappings: SourceMapping[] = [
      {
        source_id: hook.source_id,
        start: Number(hook.start_time),
        end: Number(hook.end_time),
        role: 'hook',
      },
      ...support.map((s) => ({
        source_id: s.source_id,
        start: Number(s.start_time),
        end: Number(s.end_time),
        role: 'body',
      })),
    ]
    if (cta) {
      mappings.push({
        source_id: cta.source_id,
        start: Number(cta.start_time),
        end: Number(cta.end_time),
        role: 'cta',
      })
    }

    const missing: string[] = []
    if (!support.length) missing.push('supporting_explanation')
    if (!cta) missing.push('CTA')

    const duration = mappings.reduce((sum, m) => sum + Math.max(0, m.end - m.start), 0)
    const title =
      hookText.length > 60 ? `${hookText.slice(0, 57)}…` : hookText || 'Untitled opportunity'
    const topic = normalizeTopic(hookText)
    // Near-duplicate merge by topic
    const nearDup = opportunities.find((o) => normalizeTopic(o.title) === topic)
    if (nearDup) continue

    const key = dedupeKey(title, mappings)
    if (usedKeys.has(key)) continue
    usedKeys.add(key)

    const confidence: ConfidenceLevel =
      mappings.length >= 2 && !missing.includes('supporting_explanation')
        ? 'medium'
        : 'low'

    opportunities.push({
      title,
      concept: `Short-form idea grounded in analyzed footage: ${topic || 'general'}`,
      hook: hookText,
      audience: null,
      objective: null,
      estimated_duration_sec: Number(duration.toFixed(1)),
      source_segments: mappings,
      missing_material: missing,
      confidence,
      evidence: [
        `hook_segment:${hook.source_id}:${hook.start_time}-${hook.end_time}`,
        ...support.map((s) => `body:${s.source_id}:${s.start_time}-${s.end_time}`),
      ],
      dedupe_key: key,
    })
  }

  // Persist (replace candidates)
  await admin
    .from('jarvis_video_opportunities')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'candidate')

  if (opportunities.length) {
    await admin.from('jarvis_video_opportunities').insert(
      opportunities.map((opp) => ({
        session_id: sessionId,
        title: opp.title,
        concept: opp.concept,
        hook: opp.hook,
        audience: opp.audience,
        objective: opp.objective,
        estimated_duration_sec: opp.estimated_duration_sec,
        source_segments: opp.source_segments,
        missing_material: opp.missing_material,
        confidence: opp.confidence,
        status: 'candidate',
        dedupe_key: opp.dedupe_key,
        evidence: opp.evidence,
      }))
    )
  }

  return opportunities
}

export async function estimateReelCount(sessionId: string): Promise<{
  strong_approximate: number
  possible_approximate: number
  confidence: ConfidenceLevel
  reasons: string[]
  note: string
}> {
  const admin = createAdminClient()
  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select('id, duration_sec, analysis_status')
    .eq('session_id', sessionId)
  const sourceIds = (sources ?? []).map((s) => s.id)

  const [{ data: opps }, { data: takes }, { data: segments }] = await Promise.all([
    admin
      .from('jarvis_video_opportunities')
      .select('id, confidence, missing_material')
      .eq('session_id', sessionId)
      .eq('status', 'candidate'),
    admin.from('jarvis_video_take_groups').select('id').eq('session_id', sessionId),
    sourceIds.length
      ? admin
          .from('jarvis_video_segments')
          .select('id, classification_label, source_id')
          .in('source_id', sourceIds)
          .eq('status', 'ACTIVE')
      : Promise.resolve({ data: [] as { id: string; classification_label: string | null; source_id: string }[] }),
  ])

  const analyzed = (sources ?? []).filter((s) => s.analysis_status === 'COMPLETED').length
  const hooks = (segments ?? []).filter((s) => s.classification_label === 'HOOK').length
  const uniqueOpps = opps?.length ?? 0
  const takePenalty = Math.floor((takes?.length ?? 0) * 0.5)

  const strong = Math.max(
    0,
    (opps ?? []).filter(
      (o) =>
        o.confidence !== 'low' &&
        !(Array.isArray(o.missing_material) && o.missing_material.includes('supporting_explanation'))
    ).length - takePenalty
  )
  const possible = Math.max(strong, uniqueOpps)

  const reasons = [
    `${analyzed} source(s) analyzed`,
    `${hooks} hook-labeled segment(s)`,
    `${uniqueOpps} opportunity candidate(s) after dedupe`,
    `${takes?.length ?? 0} take/duplicate group(s) reducing uniqueness`,
  ]

  return {
    strong_approximate: strong,
    possible_approximate: possible,
    confidence: analyzed === 0 ? 'low' : uniqueOpps >= 3 ? 'medium' : 'low',
    reasons,
    note: 'Approximate estimate only — not an exact publishable Reel count.',
  }
}

export async function listOpportunities(sessionId: string, limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_video_opportunities')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'candidate')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

/**
 * User idea → search footage → opportunity with gaps.
 */
export async function opportunityFromUserIdea(input: {
  sessionId: string
  idea: string
  maxResults?: number
}) {
  const { searchFootage } = await import('@/lib/jarvis/video/intelligence/search')
  const hits = await searchFootage({
    query: input.idea,
    sessionId: input.sessionId,
    limit: input.maxResults ?? 8,
  })

  const mappings: SourceMapping[] = hits
    .filter((h) => h.start != null && h.end != null)
    .map((h) => ({
      source_id: h.source_id,
      start: h.start!,
      end: h.end!,
      role: h.classification || 'body',
    }))

  const missing: string[] = []
  if (!hits.some((h) => h.classification === 'HOOK')) missing.push('HOOK')
  if (!hits.some((h) => h.classification === 'CTA')) missing.push('CTA')
  if (hits.length < 2) missing.push('supporting_footage')

  return {
    idea: input.idea,
    found: hits,
    proposed_structure: ['Hook', 'Explanation', 'Mistake', 'Solution', 'CTA'],
    source_segments: mappings,
    missing_material: missing,
    confidence: (mappings.length >= 2 ? 'medium' : 'low') as ConfidenceLevel,
    note: 'Proposal only — no render. Exact timestamps from analyzed footage.',
  }
}
