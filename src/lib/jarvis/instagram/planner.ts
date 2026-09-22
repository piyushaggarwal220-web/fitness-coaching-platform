/**
 * Evidence-backed Instagram content planning for Jarvis.
 * Separates FIRST_PARTY / EXTERNAL_RESEARCH / BUSINESS_CONTEXT.
 * Deduplicates against recent content. Never claims guaranteed viral performance.
 */

import { z } from 'zod'
import { getBrandContext } from '@/lib/ai-marketing/settings'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { saveInstagramContentPlan, listLocalInstagramContent } from '@/lib/jarvis/instagram/content-store'
import { analyzeInstagramPerformance } from '@/lib/jarvis/instagram/intelligence'
import { researchInstagramTrends } from '@/lib/jarvis/instagram/research'
import { recentMemorySummaries } from '@/lib/jarvis/memory/business-memory'
import { writeInstagramAudit } from '@/lib/jarvis/instagram/audit'
import type { InstagramContentPlan } from '@/lib/jarvis/instagram/types'

const ideaSchema = z.object({
  concept: z.string().min(5).max(400),
  hook: z.string().min(2).max(280),
  format: z.enum(['reel', 'carousel', 'story', 'post']),
  topic: z.string().min(2).max(200),
  audience: z.string().min(2).max(200),
  objective: z.string().min(2).max(200),
  why_this_idea: z.string().min(10).max(800),
  evidence_source: z.enum(['FIRST_PARTY', 'EXTERNAL_RESEARCH', 'BUSINESS_CONTEXT', 'MIXED']),
  supporting_evidence: z.array(z.string()).max(8).default([]),
  confidence: z.enum(['low', 'medium', 'high']),
  measured_language: z.string().max(400).optional(),
  external_language: z.string().max(400).optional(),
  inference_language: z.string().max(400).optional(),
  cta: z.string().min(2).max(120),
  caption_angle: z.string().min(5).max(500),
  visual_structure: z.string().min(10).max(1200),
  estimated_duration_sec: z.number().int().min(7).max(60),
  suggested_aspect_ratio: z.enum(['9:16', '1:1', '4:5']).default('9:16'),
  reel_concept: z.string().min(10).max(3000),
  caption: z.string().min(5).max(2200),
  sourced_facts: z.array(z.string()).max(12).default([]),
  jarvis_inference: z.array(z.string()).max(12).default([]),
  jarvis_recommendation: z.array(z.string()).max(12).default([]),
  research_references: z.array(z.string()).max(12).default([]),
})

const planBatchSchema = z.object({
  ideas: z.array(ideaSchema).min(1).max(10),
  data_coverage_note: z.string().max(500).optional(),
})

export type PlannedIdea = z.infer<typeof ideaSchema>

function normalizeHook(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export function detectContentDuplicates(input: {
  recentHooks: string[]
  recentTopics: string[]
  candidateHook: string
  candidateTopic: string
}): { is_near_duplicate: boolean; reason: string | null } {
  const hook = normalizeHook(input.candidateHook)
  const topic = normalizeHook(input.candidateTopic)
  for (const h of input.recentHooks) {
    const nh = normalizeHook(h)
    if (nh && hook && (nh === hook || (hook.length > 12 && nh.includes(hook.slice(0, 12))))) {
      return { is_near_duplicate: true, reason: `Similar hook already used: "${h.slice(0, 80)}"` }
    }
  }
  for (const t of input.recentTopics) {
    const nt = normalizeHook(t)
    if (nt && topic && nt === topic) {
      return { is_near_duplicate: true, reason: `Topic already used recently: "${t.slice(0, 80)}"` }
    }
  }
  return { is_near_duplicate: false, reason: null }
}

function toContentPlan(idea: PlannedIdea): InstagramContentPlan {
  return {
    topic: idea.topic,
    hook: idea.hook,
    format: idea.format,
    reel_concept: idea.reel_concept || idea.concept,
    caption: idea.caption,
    cta: idea.cta,
    target_audience: idea.audience,
    objective: idea.objective,
    suggested_publishing_window: 'weekday evening IST',
    research_references: idea.research_references,
    sourced_facts: idea.sourced_facts,
    jarvis_inference: idea.jarvis_inference,
    jarvis_recommendation: idea.jarvis_recommendation,
  }
}

export async function planInstagramContent(input: {
  count?: number
  number_of_ideas?: number
  objective?: string
  topicHint?: string
  content_type?: 'reel' | 'carousel' | 'story' | 'post'
  audience?: string
  funnel_id?: string
  research?: boolean
  researchSummary?: string
  sourcedFacts?: string[]
  date_range_days?: number
  actorId?: string | null
  save?: boolean
}): Promise<{
  ok: boolean
  data_status: 'verified' | 'failed' | 'unavailable' | 'partial'
  source: string
  retrieved_at: string
  plans: InstagramContentPlan[]
  ideas: PlannedIdea[]
  content_ids: string[]
  note: string
  error?: string
  evidence: {
    first_party: Record<string, unknown>
    external_research: Record<string, unknown> | null
    business_context: Record<string, unknown>
  }
  dedupe: { avoided: string[]; recent_hooks_checked: number }
  separation: {
    sourced_facts: string[]
    jarvis_inference: string[]
    jarvis_recommendation: string[]
  }
  sample_size: number | null
}> {
  const retrieved_at = new Date().toISOString()
  const count = Math.min(Math.max(input.number_of_ideas ?? input.count ?? 3, 1), 10)

  const gate = await assertAiBudgetAvailable(0.2)
  if (!gate.ok) {
    return {
      ok: false,
      data_status: 'unavailable',
      source: 'instagram.plan_content',
      retrieved_at,
      plans: [],
      ideas: [],
      content_ids: [],
      note: gate.reason,
      error: gate.reason,
      evidence: {
        first_party: {},
        external_research: null,
        business_context: {},
      },
      dedupe: { avoided: [], recent_hooks_checked: 0 },
      separation: { sourced_facts: [], jarvis_inference: [], jarvis_recommendation: [] },
      sample_size: null,
    }
  }

  try {
    const [perf, local, brand, memory] = await Promise.all([
      analyzeInstagramPerformance({
        days: input.date_range_days ?? 30,
        writeMemory: false,
        actorId: input.actorId,
      }),
      listLocalInstagramContent(40),
      getBrandContext(),
      recentMemorySummaries(12),
    ])

    const sample_size = perf.value?.sample_size ?? null
    const recentHooks = (local.value ?? []).map((r) => r.hook || '').filter(Boolean)
    const recentTopics = (local.value ?? []).map((r) => r.topic || '').filter(Boolean)

    let external: Record<string, unknown> | null = null
    let researchSummary = input.researchSummary ?? null
    let sourcedFacts = input.sourcedFacts ?? []

    if (input.research) {
      const researchGate = await assertAiBudgetAvailable(0.35)
      if (!researchGate.ok) {
        external = {
          status: 'budget_exhausted',
          note: researchGate.reason,
        }
      } else {
        const trends = await researchInstagramTrends({
          focus: 'reels_trends',
          question: input.topicHint || input.objective || 'fitness reel trends India',
          actorId: input.actorId,
          maxBudgetUsd: 0.35,
        })
        external = {
          status: trends.data_status,
          note: trends.note,
          facts: trends.sourced_facts ?? [],
          inferences: trends.jarvis_inference ?? [],
          recommendations: trends.jarvis_recommendation ?? [],
        }
        if (Array.isArray(trends.sourced_facts) && trends.sourced_facts.length) {
          sourcedFacts = [...sourcedFacts, ...trends.sourced_facts.map(String)].slice(0, 20)
        }
        researchSummary =
          researchSummary ||
          [trends.note, ...(trends.sourced_facts ?? []).slice(0, 5)].filter(Boolean).join(' | ')
      }
    }

    const firstParty = {
      sample_size,
      strongest_patterns: perf.value?.strongest_patterns ?? [],
      weakest_patterns: perf.value?.weakest_patterns ?? [],
      observations: perf.value?.observations ?? [],
      data_limitations: perf.value?.data_limitations ?? [],
      by_media_type: perf.value?.by_media_type ?? [],
      rates: perf.value?.rates ?? null,
      coverage_note:
        sample_size == null || sample_size < 5
          ? 'There is insufficient first-party data to conclude a winning format. Ideas must stay low-confidence tests.'
          : `First-party sample size: ${sample_size} synced posts.`,
      memory: memory.map((m) => ({ title: m.title, summary: m.summary, category: m.category })),
      recent_local_content: (local.value ?? []).slice(0, 15).map((r) => ({
        topic: r.topic,
        hook: r.hook,
        content_type: r.content_type,
        status: r.status,
      })),
    }

    const businessContext = {
      brand,
      funnel_id: input.funnel_id ?? null,
      audience: input.audience ?? null,
      objective: input.objective ?? null,
      preferred_format: input.content_type ?? 'reel',
      note: 'Use existing LURVOX funnel/offer context only — do not invent pricing.',
    }

    const { data } = await generateMarketingJson({
      systemPrompt: `You are the LURVOX Instagram Content Planner for Jarvis.
Produce evidence-backed Instagram ideas. Prefer Reels in 9:16, 7–60 seconds.

STRICT EVIDENCE RULES:
- Label each idea evidence_source as FIRST_PARTY, EXTERNAL_RESEARCH, BUSINESS_CONTEXT, or MIXED.
- Use measured language: "The available Instagram data shows..."
- Use external language: "External research suggests..."
- Use inference language: "Jarvis recommends testing..."
- If first-party sample_size < 5, confidence MUST be low and say insufficient data to conclude a winning format.
- NEVER say: always works, will go viral, guaranteed to perform.
- Avoid near-duplicate hooks/topics from recent_local_content unless unavoidable; prefer fresh angles.
- Separate sourced_facts / jarvis_inference / jarvis_recommendation.`,
      userPrompt: JSON.stringify({
        count,
        topic_hint: input.topicHint ?? null,
        objective: input.objective ?? null,
        audience: input.audience ?? null,
        content_type: input.content_type ?? 'reel',
        first_party: firstParty,
        external_research: external,
        business_context: businessContext,
        research_summary: researchSummary,
        sourced_facts_input: sourcedFacts,
        avoid_hooks: recentHooks.slice(0, 20),
        avoid_topics: recentTopics.slice(0, 20),
      }),
      schema: planBatchSchema,
      maxTokens: 7000,
    })

    await recordCostUsage({
      category: 'tool',
      toolName: 'instagram.plan_content',
      costUsd: 0.2,
      metadata: { count: data.ideas.length, research: Boolean(input.research) },
    })

    const avoided: string[] = []
    const filtered: PlannedIdea[] = []
    for (const idea of data.ideas) {
      const dup = detectContentDuplicates({
        recentHooks,
        recentTopics,
        candidateHook: idea.hook,
        candidateTopic: idea.topic,
      })
      if (dup.is_near_duplicate) {
        avoided.push(dup.reason || 'duplicate')
        // Keep but force low confidence + note
        filtered.push({
          ...idea,
          confidence: 'low',
          why_this_idea: `${idea.why_this_idea} (Near-duplicate risk: ${dup.reason})`,
        })
      } else {
        filtered.push(
          sample_size != null && sample_size < 5
            ? { ...idea, confidence: idea.confidence === 'high' ? 'medium' : idea.confidence === 'medium' ? 'low' : 'low' }
            : idea
        )
      }
    }

    const plans = filtered.map(toContentPlan)
    const content_ids: string[] = []

    if (input.save !== false) {
      for (let i = 0; i < plans.length; i++) {
        const idea = filtered[i]!
        const saved = await saveInstagramContentPlan({
          plan: plans[i]!,
          actorId: input.actorId,
          status: 'idea',
          funnelId: input.funnel_id ?? null,
          extraMetadata: {
            planner_v2: true,
            concept: idea.concept,
            evidence_source: idea.evidence_source,
            supporting_evidence: idea.supporting_evidence,
            confidence: idea.confidence,
            caption_angle: idea.caption_angle,
            visual_structure: idea.visual_structure,
            estimated_duration_sec: idea.estimated_duration_sec,
            suggested_aspect_ratio: idea.suggested_aspect_ratio,
            funnel_id: input.funnel_id ?? null,
            sample_size,
          },
        })
        if (saved.content_id) content_ids.push(saved.content_id)
      }
    }

    await writeInstagramAudit({
      action: 'instagram.plan_content',
      target: null,
      actor: input.actorId ?? 'jarvis',
      approval_state: null,
      result: 'ok',
      provider_response_status: null,
      extra: { content_ids, idea_count: filtered.length, sample_size, avoided },
    })

    return {
      ok: true,
      data_status: sample_size != null && sample_size > 0 ? 'verified' : 'partial',
      source: 'instagram.plan_content',
      retrieved_at,
      plans,
      ideas: filtered,
      content_ids,
      note:
        sample_size != null && sample_size < 5
          ? `Produced ${filtered.length} idea(s). First-party sample is small (${sample_size ?? 0}) — treat as test recommendations, not proven winners.`
          : `Produced ${filtered.length} evidence-backed idea(s). Facts/inference/recommendation are separated.`,
      evidence: {
        first_party: firstParty,
        external_research: external,
        business_context: businessContext,
      },
      dedupe: { avoided, recent_hooks_checked: recentHooks.length },
      separation: {
        sourced_facts: filtered.flatMap((p) => p.sourced_facts),
        jarvis_inference: filtered.flatMap((p) => p.jarvis_inference),
        jarvis_recommendation: filtered.flatMap((p) => p.jarvis_recommendation),
      },
      sample_size,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await writeInstagramAudit({
      action: 'instagram.plan_content',
      target: null,
      actor: input.actorId ?? 'jarvis',
      approval_state: null,
      result: 'failed',
      provider_response_status: null,
      error_redacted: error,
    })
    return {
      ok: false,
      data_status: 'failed',
      source: 'instagram.plan_content',
      retrieved_at,
      plans: [],
      ideas: [],
      content_ids: [],
      note: 'Content planning failed.',
      error,
      evidence: { first_party: {}, external_research: null, business_context: {} },
      dedupe: { avoided: [], recent_hooks_checked: 0 },
      separation: { sourced_facts: [], jarvis_inference: [], jarvis_recommendation: [] },
      sample_size: null,
    }
  }
}

/** Pure planner normalizer for tests (no AI). */
export function normalizeContentPlan(raw: Partial<InstagramContentPlan>): InstagramContentPlan {
  return {
    topic: raw.topic?.trim() || 'Untitled topic',
    hook: raw.hook?.trim() || 'Hook pending',
    format: raw.format ?? 'reel',
    reel_concept: raw.reel_concept?.trim() || 'Concept pending',
    caption: raw.caption?.trim() || 'Caption pending',
    cta: raw.cta?.trim() || 'Learn more',
    target_audience: raw.target_audience?.trim() || 'Fitness beginners',
    objective: raw.objective?.trim() || 'awareness',
    suggested_publishing_window: raw.suggested_publishing_window?.trim() || 'weekday evening IST',
    research_references: raw.research_references ?? [],
    sourced_facts: raw.sourced_facts ?? [],
    jarvis_inference: raw.jarvis_inference ?? [],
    jarvis_recommendation: raw.jarvis_recommendation ?? [],
  }
}
