/**
 * Creative Director planning: opportunity → plan, idea → footage search → plan.
 * Deterministic core; does not publish or render.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import type { ContentOpportunity, SourceMapping } from '@/lib/jarvis/video/intelligence/types'
import { searchFootage } from '@/lib/jarvis/video/intelligence/search'
import { buildOpportunitiesForSession } from '@/lib/jarvis/video/intelligence/opportunities'
import { buildHookFromFootage } from '@/lib/jarvis/creative/hooks'
import { pickCta, normalizeObjective } from '@/lib/jarvis/creative/cta'
import { selectStructure, inferFormat, inferPillar } from '@/lib/jarvis/creative/structure'
import { buildScriptBeats, withHookMapping } from '@/lib/jarvis/creative/script'
import { runCreativeQualityChecks } from '@/lib/jarvis/creative/quality'
import {
  applyInstructionOverrides,
  loadCreativeMemoryContext,
  type CreativeMemoryContext,
} from '@/lib/jarvis/creative/memory-context'
import {
  conceptFingerprint,
  findExistingByFingerprint,
  saveCreativePlan,
} from '@/lib/jarvis/creative/store'
import type {
  CreativeAudience,
  CreativeInput,
  CreativePlan,
  CreativeObjective,
} from '@/lib/jarvis/creative/types'
import { buildEditHandoff } from '@/lib/jarvis/creative/handoff'

function sourceKey(segments: SourceMapping[]): string {
  return segments
    .map((s) => `${s.source_id}:${s.start.toFixed(1)}-${s.end.toFixed(1)}`)
    .sort()
    .join('|')
}

function buildAudience(
  label: string | null | undefined,
  kind: CreativeAudience['assumption_kind']
): CreativeAudience {
  const has = Boolean(label?.trim())
  return {
    label: label?.trim() || 'Fat-loss beginners (Indian audience where specified)',
    pain_points: has && kind === 'USER_PROVIDED' ? [] : ['Inconsistent fat loss'],
    desires: has && kind === 'USER_PROVIDED' ? [] : ['Clear, practical guidance'],
    knowledge_level: 'beginner/intermediate',
    objections: [],
    content_preferences: [],
    assumption_kind: has
      ? kind === 'USER_PROVIDED'
        ? 'USER_PROVIDED'
        : 'INFERENCE'
      : 'ASSUMPTION',
  }
}

export function opportunityToCreativePlan(input: {
  opportunity: ContentOpportunity & { id?: string }
  objective?: CreativeObjective | string
  audience?: string
  tone?: string
  duration_sec?: number
  cta?: string
  funnel_id?: string | null
  funnel_hint?: string | null
  pillars?: string[]
  memory: CreativeMemoryContext
  variant_label?: string | null
  known_source_ids?: Set<string>
}): CreativePlan {
  const opp = input.opportunity
  const objective = normalizeObjective(input.objective || opp.objective)
  const hookSeg = opp.source_segments.find((s) => s.role === 'hook') || opp.source_segments[0]
  const bodySegs = opp.source_segments.filter((s) => s.role !== 'hook' && s.role !== 'cta')
  const ctaSeg = opp.source_segments.find((s) => s.role === 'cta')

  const hook = buildHookFromFootage({
    spokenExcerpt: opp.hook,
    ideaHint: opp.concept || opp.title,
    allowRewrite: !opp.hook,
  })

  const labels = opp.source_segments.map((s) => String(s.role || '').toUpperCase())
  const format = inferFormat({ labels, objective })
  const structure = selectStructure({
    objective,
    format,
    hasMyth: /myth/i.test(opp.title + (opp.concept || '')),
    hasStory: /story|journey/i.test(opp.title + (opp.concept || '')),
  })

  const bodies = bodySegs.map((m) => ({
    text: `${opp.concept || opp.title}`.slice(0, 200),
    mapping: m,
  }))
  const withHook = withHookMapping(hookSeg, hook.source_excerpt || hook.text, bodies)

  const { cta, matches_objective } = pickCta({
    objective,
    explicitCta: input.cta,
    funnelHint: input.funnel_hint,
  })

  const script = buildScriptBeats({
    structure_id: structure.structure_id,
    hook,
    bodySegments: withHook,
    cta,
    hasSpokenCta: Boolean(ctaSeg),
    ctaMapping: ctaSeg ?? null,
    reduceOverlays: input.memory.reduce_overlays,
  })

  const missing = [
    ...new Set([
      ...(opp.missing_material || []),
      ...script.new_recording_requirements.map((r) =>
        r.startsWith('Record CTA') ? 'CTA' : r.startsWith('Record hook') ? 'HOOK' : r
      ),
    ]),
  ]

  const pillar = inferPillar(opp.title + ' ' + (opp.concept || ''), input.pillars)
  const fingerprint = conceptFingerprint({
    title: opp.title,
    hook: hook.text,
    source_key: sourceKey(opp.source_segments),
    variant: input.variant_label,
  })

  const quality = runCreativeQualityChecks({
    source_segments: opp.source_segments,
    script_beats: script.beats,
    hook,
    cta,
    objective,
    estimated_duration_sec: script.estimated_duration_sec,
    target_duration_sec: input.duration_sec,
    known_source_ids: input.known_source_ids,
  })

  return {
    title: opp.title,
    concept: opp.concept || opp.title,
    angle: `Footage-backed angle from opportunity: ${opp.title}`,
    objective,
    audience: buildAudience(
      input.audience || opp.audience,
      input.audience ? 'USER_PROVIDED' : 'INFERENCE'
    ),
    pillar,
    format,
    platform: 'instagram',
    tone: input.tone || 'clear, practical, non-hype',
    hook,
    structure_id: structure.structure_id,
    structure_steps: structure.steps,
    script_beats: script.beats,
    cta,
    cta_objective_match: matches_objective,
    source_segments: opp.source_segments,
    missing_material: missing,
    overlays: script.overlays,
    new_recording_requirements: script.new_recording_requirements,
    estimated_duration_sec: script.estimated_duration_sec,
    target_duration_sec: input.duration_sec ?? opp.estimated_duration_sec,
    confidence: opp.confidence,
    review_status: 'DRAFT',
    preferences_applied: input.memory.preferences,
    taste_influences: (input.memory.taste_influences || []).map((t) => ({
      dimension: t.dimension,
      preference_key: t.preference_key,
      preference_value: t.preference_value,
      confidence: t.confidence,
      reason: t.reason,
    })),
    audience_notes: input.memory.audience_notes || [],
    lessons_considered: input.memory.lessons,
    current_instruction_override: input.memory.current_instruction,
    funnel_id: input.funnel_id ?? null,
    business_objective_note: input.funnel_hint
      ? `Funnel context attached (${input.funnel_hint}). No ads launched.`
      : null,
    ordering_reason: 'source completeness + opportunity confidence',
    claim_flags: quality.claim_flags,
    quality,
    edit_handoff: buildEditHandoff({
      duration: script.estimated_duration_sec,
      source_segments: opp.source_segments,
      beats: script.beats,
      overlays: script.overlays,
      new_recording: script.new_recording_requirements,
      cta,
      minimal_zooms: input.memory.minimal_zooms,
    }),
    evidence: opp.evidence || [],
    concept_fingerprint: fingerprint,
    variant_label: input.variant_label ?? null,
    parent_fingerprint: null,
  }
}

export async function planFromSession(input: CreativeInput): Promise<{
  ok: boolean
  status: 'ok' | 'PAUSED_BUDGET' | 'failed' | 'needs_analysis' | 'empty'
  plans: CreativePlan[]
  content_ids: string[]
  note: string
  distribution?: Record<string, number>
  cost_usd: number
}> {
  const budget = await assertAiBudgetAvailable(0.05)
  if (!budget.ok) {
    return {
      ok: false,
      status: 'PAUSED_BUDGET',
      plans: [],
      content_ids: [],
      note: budget.reason,
      cost_usd: 0,
    }
  }

  if (!input.session_id) {
    return {
      ok: false,
      status: 'failed',
      plans: [],
      content_ids: [],
      note: 'session_id required for footage → creative workflow',
      cost_usd: 0,
    }
  }

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('jarvis_video_sessions')
    .select('id, status, source_count')
    .eq('id', input.session_id)
    .maybeSingle()

  if (!session) {
    return {
      ok: false,
      status: 'failed',
      plans: [],
      content_ids: [],
      note: 'Session not found',
      cost_usd: 0,
    }
  }

  if (session.status === 'open' || session.status === 'validating') {
    return {
      ok: false,
      status: 'needs_analysis',
      plans: [],
      content_ids: [],
      note: 'Session not analyzed yet. Run video.analyze first.',
      cost_usd: 0,
    }
  }

  let opportunities: Array<ContentOpportunity & { id?: string }> = []
  const { data: stored } = await admin
    .from('jarvis_video_opportunities')
    .select('*')
    .eq('session_id', input.session_id)
    .eq('status', 'candidate')
    .order('created_at', { ascending: false })
    .limit(20)

  if (stored?.length) {
    opportunities = stored.map((o) => ({
      id: o.id,
      title: o.title,
      concept: o.concept || o.title,
      hook: o.hook,
      audience: o.audience,
      objective: o.objective,
      estimated_duration_sec: o.estimated_duration_sec != null ? Number(o.estimated_duration_sec) : null,
      source_segments: (o.source_segments || []) as SourceMapping[],
      missing_material: o.missing_material || [],
      confidence: o.confidence,
      evidence: (o.evidence || []) as string[],
      dedupe_key: o.dedupe_key || o.id,
    }))
  } else {
    opportunities = await buildOpportunitiesForSession(input.session_id)
  }

  if (!opportunities.length) {
    return {
      ok: false,
      status: 'empty',
      plans: [],
      content_ids: [],
      note: 'No content opportunities found. Ensure transcription/segments completed.',
      cost_usd: 0,
    }
  }

  let memory = await loadCreativeMemoryContext({
    query: input.idea || 'reel creative plan footage',
    current_instruction: input.current_instruction,
    funnel_id: input.funnel_id,
  })
  memory = applyInstructionOverrides(memory, input.current_instruction)

  const { data: sources } = await admin
    .from('jarvis_video_sources')
    .select('id')
    .eq('session_id', input.session_id)
  const known = new Set((sources ?? []).map((s) => s.id))

  const count = Math.min(Math.max(input.count ?? 5, 1), 10)
  const plans: CreativePlan[] = []
  const content_ids: string[] = []
  const distribution: Record<string, number> = {}

  for (const opp of opportunities) {
    if (plans.length >= count) break
    const plan = opportunityToCreativePlan({
      opportunity: opp,
      objective: input.objective,
      audience: input.audience,
      tone: input.tone,
      duration_sec: input.duration_sec,
      cta: input.cta,
      funnel_id: input.funnel_id,
      funnel_hint: input.funnel_id ? 'linked funnel' : null,
      pillars: input.pillars,
      memory,
      known_source_ids: known,
    })

    if (!input.force_new_variants) {
      const existing = await findExistingByFingerprint(plan.concept_fingerprint)
      if (existing) continue
    }

    plans.push(plan)
    distribution[plan.format] = (distribution[plan.format] || 0) + 1

    if (input.save !== false) {
      const saved = await saveCreativePlan({
        plan,
        actorId: input.actorId,
        sessionId: input.session_id,
        opportunityId: opp.id,
        funnelId: input.funnel_id,
      })
      content_ids.push(saved.id)
    }
  }

  await recordCostUsage({
    toolName: 'creative.plan',
    category: 'tool',
    costUsd: 0.02,
    metadata: { session_id: input.session_id, plans: plans.length },
  }).catch(() => null)

  return {
    ok: plans.length > 0,
    status: plans.length ? 'ok' : 'empty',
    plans,
    content_ids,
    note: plans.length
      ? `Created ${plans.length} footage-backed creative plan(s). Not published. Not rendered.`
      : 'All opportunities already have creatives (idempotent). Pass force_new_variants to create variants.',
    distribution,
    cost_usd: 0.02,
  }
}

export async function planFromIdea(input: CreativeInput): Promise<{
  ok: boolean
  status: 'ok' | 'PAUSED_BUDGET' | 'failed' | 'missing_footage'
  plan: CreativePlan | null
  content_id: string | null
  search_hits: number
  note: string
  cost_usd: number
}> {
  const budget = await assertAiBudgetAvailable(0.05)
  if (!budget.ok) {
    return {
      ok: false,
      status: 'PAUSED_BUDGET',
      plan: null,
      content_id: null,
      search_hits: 0,
      note: budget.reason,
      cost_usd: 0,
    }
  }

  const idea = (input.idea || '').trim()
  if (!idea) {
    return {
      ok: false,
      status: 'failed',
      plan: null,
      content_id: null,
      search_hits: 0,
      note: 'idea is required',
      cost_usd: 0,
    }
  }

  const hits = await searchFootage({
    query: idea,
    sessionId: input.session_id,
    limit: 8,
  })

  const mappings: SourceMapping[] = hits.slice(0, 4).map((h, i) => ({
    source_id: h.source_id,
    start: Number(h.start ?? 0),
    end: Number(h.end ?? (h.start ?? 0) + 5),
    role: i === 0 ? 'hook' : 'body',
  })).filter((m) => m.end > m.start)

  const hookText = hits[0]?.transcript || null
  const missing: string[] = []
  if (!hits.length) missing.push('No matching footage for idea')
  if (!hits.some((h) => /cta|follow|comment|dm|save/i.test(h.transcript || ''))) {
    missing.push('CTA')
  }

  const syntheticOpp: ContentOpportunity = {
    title: idea.slice(0, 120),
    concept: `User idea: ${idea}`,
    hook: hookText,
    audience: input.audience || null,
    objective: input.objective || 'EDUCATION',
    estimated_duration_sec: input.duration_sec ?? null,
    source_segments: mappings,
    missing_material: missing,
    confidence: hits.length ? 'medium' : 'low',
    evidence: hits.map((h) => `search:${h.source_id}:${h.start}-${h.end}`),
    dedupe_key: conceptFingerprint({
      title: idea,
      hook: hookText || idea,
      source_key: sourceKey(mappings),
    }),
  }

  let memory = await loadCreativeMemoryContext({
    query: idea,
    current_instruction: input.current_instruction,
    funnel_id: input.funnel_id,
  })
  memory = applyInstructionOverrides(memory, input.current_instruction)

  const plan = opportunityToCreativePlan({
    opportunity: syntheticOpp,
    objective: input.objective,
    audience: input.audience,
    tone: input.tone,
    duration_sec: input.duration_sec,
    cta: input.cta,
    funnel_id: input.funnel_id,
    funnel_hint: input.funnel_id ? 'linked funnel' : null,
    pillars: input.pillars,
    memory,
  })

  let content_id: string | null = null
  if (input.save !== false) {
    const saved = await saveCreativePlan({
      plan,
      actorId: input.actorId,
      sessionId: input.session_id,
      funnelId: input.funnel_id,
    })
    content_id = saved.id
  }

  await recordCostUsage({
    toolName: 'creative.generate_draft',
    category: 'tool',
    costUsd: 0.02,
    metadata: { idea: idea.slice(0, 80), hits: hits.length },
  }).catch(() => null)

  return {
    ok: true,
    status: hits.length ? 'ok' : 'missing_footage',
    plan,
    content_id,
    search_hits: hits.length,
    note: hits.length
      ? `Draft created from ${hits.length} footage hit(s). Review before edit. Not published.`
      : 'No matching footage — plan marks NEW_RECORDING_REQUIRED. Not published.',
    cost_usd: 0.02,
  }
}
