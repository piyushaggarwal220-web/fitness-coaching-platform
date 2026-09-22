/**
 * Batch creative planning with format/objective diversity and dedupe.
 */

import type { CreativeInput, CreativePlan, CreativeObjective } from '@/lib/jarvis/creative/types'
import { planFromSession, opportunityToCreativePlan } from '@/lib/jarvis/creative/plan'
import { generateHookVariants } from '@/lib/jarvis/creative/hooks'
import {
  applyInstructionOverrides,
  loadCreativeMemoryContext,
} from '@/lib/jarvis/creative/memory-context'
import { saveCreativePlan, findExistingByFingerprint } from '@/lib/jarvis/creative/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import type { ContentOpportunity, SourceMapping } from '@/lib/jarvis/video/intelligence/types'
import { normalizeObjective } from '@/lib/jarvis/creative/cta'

const OBJECTIVE_POOL: CreativeObjective[] = [
  'EDUCATION',
  'AUTHORITY',
  'ENGAGEMENT',
  'AWARENESS',
  'LEAD_GENERATION',
  'TRUST',
  'SALES',
]

function diversifyObjectives(count: number, preferred?: string): CreativeObjective[] {
  const base = preferred ? normalizeObjective(preferred) : null
  const out: CreativeObjective[] = []
  if (base) out.push(base)
  for (const o of OBJECTIVE_POOL) {
    if (out.length >= count) break
    if (!out.includes(o)) out.push(o)
  }
  while (out.length < count) out.push('EDUCATION')
  return out.slice(0, count)
}

export async function planCreativeBatch(input: CreativeInput): Promise<{
  ok: boolean
  status: string
  plans: CreativePlan[]
  content_ids: string[]
  distribution: Record<string, number>
  note: string
  cost_usd: number
}> {
  const budget = await assertAiBudgetAvailable(0.08)
  if (!budget.ok) {
    return {
      ok: false,
      status: 'PAUSED_BUDGET',
      plans: [],
      content_ids: [],
      distribution: {},
      note: budget.reason,
      cost_usd: 0,
    }
  }

  const count = Math.min(Math.max(input.count ?? 5, 1), 10)

  // Prefer session-backed batch
  if (input.session_id) {
    const base = await planFromSession({ ...input, count, save: false })
    if (!base.ok && base.status !== 'empty') {
      return {
        ok: false,
        status: base.status,
        plans: [],
        content_ids: [],
        distribution: {},
        note: base.note,
        cost_usd: 0,
      }
    }

    const objectives = diversifyObjectives(count, input.objective)
    let memory = await loadCreativeMemoryContext({
      query: input.idea || 'batch reels',
      current_instruction: input.current_instruction,
      funnel_id: input.funnel_id,
    })
    memory = applyInstructionOverrides(memory, input.current_instruction)

    const admin = createAdminClient()
    const { data: stored } = await admin
      .from('jarvis_video_opportunities')
      .select('*')
      .eq('session_id', input.session_id)
      .limit(20)

    const opps: Array<ContentOpportunity & { id?: string }> = (stored ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      concept: o.concept || o.title,
      hook: o.hook,
      audience: o.audience,
      objective: o.objective,
      estimated_duration_sec:
        o.estimated_duration_sec != null ? Number(o.estimated_duration_sec) : null,
      source_segments: (o.source_segments || []) as SourceMapping[],
      missing_material: o.missing_material || [],
      confidence: o.confidence,
      evidence: (o.evidence || []) as string[],
      dedupe_key: o.dedupe_key || o.id,
    }))

    // Seed from planFromSession results or rebuild
    let seeds = base.plans
    if (!seeds.length && opps.length) {
      seeds = opps.slice(0, count).map((opp, i) =>
        opportunityToCreativePlan({
          opportunity: opp,
          objective: objectives[i],
          audience: input.audience,
          tone: input.tone,
          duration_sec: input.duration_sec,
          cta: input.cta,
          funnel_id: input.funnel_id,
          memory,
        })
      )
    }

    // Enforce diversity: re-label objectives/formats across seeds
    const plans: CreativePlan[] = []
    const content_ids: string[] = []
    const distribution: Record<string, number> = {}
    const seenFp = new Set<string>()

    for (let i = 0; i < Math.min(count, Math.max(seeds.length, opps.length)); i++) {
      const opp = opps[i] || {
        title: seeds[i]?.title || `Concept ${i + 1}`,
        concept: seeds[i]?.concept || '',
        hook: seeds[i]?.hook.text || null,
        audience: input.audience || null,
        objective: objectives[i],
        estimated_duration_sec: input.duration_sec ?? null,
        source_segments: seeds[i]?.source_segments || [],
        missing_material: seeds[i]?.missing_material || [],
        confidence: seeds[i]?.confidence || 'low',
        evidence: seeds[i]?.evidence || [],
        dedupe_key: `batch-${i}`,
      }

      const plan = opportunityToCreativePlan({
        opportunity: opp,
        objective: objectives[i % objectives.length],
        audience: input.audience,
        tone: input.tone,
        duration_sec: input.duration_sec,
        cta: input.cta,
        funnel_id: input.funnel_id,
        funnel_hint: input.funnel_id ? 'linked funnel' : null,
        pillars: input.pillars,
        memory,
        variant_label: `batch_${i + 1}`,
      })

      // Optional hook variant for diversity without inventing claims
      const hookVars = generateHookVariants({
        baseSpoken: plan.hook.source_excerpt,
        topic: plan.title,
        max: 2,
      })
      if (hookVars[1] && i % 2 === 1) {
        plan.hook = hookVars[1]
        plan.variant_label = `${plan.variant_label || 'batch'}_${hookVars[1].type}`
      }

      if (seenFp.has(plan.concept_fingerprint)) continue
      seenFp.add(plan.concept_fingerprint)

      if (!input.force_new_variants) {
        const existing = await findExistingByFingerprint(plan.concept_fingerprint)
        if (existing) continue
      }

      plans.push(plan)
      distribution[plan.format] = (distribution[plan.format] || 0) + 1
      distribution[`obj:${plan.objective}`] = (distribution[`obj:${plan.objective}`] || 0) + 1

      if (input.save !== false) {
        const saved = await saveCreativePlan({
          plan,
          actorId: input.actorId,
          sessionId: input.session_id,
          opportunityId: 'id' in opp ? (opp as { id?: string }).id : undefined,
          funnelId: input.funnel_id,
        })
        content_ids.push(saved.id)
      }
    }

    await recordCostUsage({
      toolName: 'creative.plan_batch',
      category: 'tool',
      costUsd: 0.03,
      metadata: { count: plans.length },
    }).catch(() => null)

    return {
      ok: plans.length > 0,
      status: plans.length ? 'ok' : 'empty',
      plans,
      content_ids,
      distribution,
      note: `Batch of ${plans.length} diversified creative(s). Distribution shown. Not published. Not rendered.`,
      cost_usd: 0.03,
    }
  }

  // Idea-only batch without session: still produce distinct angles from idea text
  if (!input.idea) {
    return {
      ok: false,
      status: 'failed',
      plans: [],
      content_ids: [],
      distribution: {},
      note: 'session_id or idea required',
      cost_usd: 0,
    }
  }

  // Reuse session path message — without footage we refuse to invent 10 identical videos
  return {
    ok: false,
    status: 'failed',
    plans: [],
    content_ids: [],
    distribution: {},
    note: 'Batch planning requires a video session for footage-backed diversity. Use creative.generate_draft for a single idea.',
    cost_usd: 0,
  }
}
