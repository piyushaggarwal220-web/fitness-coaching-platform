/**
 * Phase 20 — Experimentation on marketing_experiments (reuse, don't fork).
 * Bounded, measurable, approval-aware. No live Meta writes from these tools.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { canPromoteToOperatingRule, canPromoteToPattern } from '@/lib/jarvis/memory/strategic/evidence'

export type JarvisExperimentLifecycle =
  | 'IDEA'
  | 'HYPOTHESIS'
  | 'DESIGN'
  | 'BASELINE'
  | 'APPROVAL'
  | 'RUNNING'
  | 'DATA_COLLECTION'
  | 'SUFFICIENT_DATA'
  | 'ANALYSIS'
  | 'DECISION'
  | 'LEARNED'
  | 'INCONCLUSIVE'
  | 'STOPPED'
  | 'INVALID'
  | 'EXPIRED'

export type DataSufficiency = 'INSUFFICIENT' | 'PRELIMINARY' | 'SUFFICIENT' | 'STRONG'

const HYPOTHESIS_RE =
  /\bif\b.+\bthen\b.+\b(because|since|due to)\b/i

export function validateHypothesis(hypothesis: string): { ok: boolean; error?: string } {
  const h = hypothesis.trim()
  if (h.length < 20) return { ok: false, error: 'Hypothesis too vague — expand measurable claim.' }
  if (/let'?s try|see what happens|just test/i.test(h) && !HYPOTHESIS_RE.test(h)) {
    return {
      ok: false,
      error: 'Convert to: If we change X, then metric Y may improve, because Z.',
    }
  }
  if (!/\b(if|when)\b/i.test(h) || !/\b(then|may|might|could)\b/i.test(h)) {
    return {
      ok: false,
      error: 'Hypothesis must state change → expected metric effect (use may/might — not certainty).',
    }
  }
  return { ok: true }
}

export function assessDataSufficiency(input: {
  purchases: number
  spend: number
  minimum_purchases: number
  minimum_spend: number
}): DataSufficiency {
  if (input.purchases < input.minimum_purchases && input.spend < input.minimum_spend) {
    return 'INSUFFICIENT'
  }
  if (input.purchases < input.minimum_purchases || input.spend < input.minimum_spend) {
    return 'PRELIMINARY'
  }
  if (input.purchases >= input.minimum_purchases * 2 && input.spend >= input.minimum_spend * 2) {
    return 'STRONG'
  }
  return 'SUFFICIENT'
}

export async function createExperiment(input: {
  name: string
  hypothesis: string
  variable: string
  funnel_id?: string | null
  success_metric?: string
  control_description?: string
  treatment_description?: string
  minimum_spend?: number
  minimum_purchases?: number
  budget_cents?: number
  cost_limit_usd?: number
  decision_rule?: string
  actorId?: string | null
}): Promise<{ ok: boolean; experiment?: Record<string, unknown>; error?: string }> {
  const hyp = validateHypothesis(input.hypothesis)
  if (!hyp.ok) return { ok: false, error: hyp.error }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_experiments')
    .insert({
      name: input.name.slice(0, 200),
      hypothesis: input.hypothesis.slice(0, 2000),
      variable: input.variable.slice(0, 200),
      funnel_id: input.funnel_id ?? null,
      success_metric: input.success_metric ?? 'cpa',
      primary_metric: input.success_metric ?? 'cpa',
      control_description: input.control_description ?? null,
      treatment_description: input.treatment_description ?? null,
      minimum_spend: input.minimum_spend ?? 500,
      minimum_purchases: input.minimum_purchases ?? 5,
      budget_cents: input.budget_cents ?? null,
      cost_limit_usd: input.cost_limit_usd ?? 25,
      decision_rule: input.decision_rule ?? 'Require SUFFICIENT data before declaring winner.',
      status: 'draft',
      jarvis_lifecycle: 'HYPOTHESIS',
      data_sufficiency: 'INSUFFICIENT',
      created_by: input.actorId ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, experiment: data }
}

export async function getExperiment(id: string) {
  const admin = createAdminClient()
  const { data } = await admin.from('marketing_experiments').select('*').eq('id', id).maybeSingle()
  return data
}

export async function listExperiments(limit = 30) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('marketing_experiments')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function transitionExperiment(input: {
  id: string
  lifecycle: JarvisExperimentLifecycle
  status?: string
  result?: Record<string, unknown>
  purchases?: number
  spend?: number
}): Promise<{ ok: boolean; experiment?: Record<string, unknown>; error?: string }> {
  const row = await getExperiment(input.id)
  if (!row) return { ok: false, error: 'not_found' }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = {
    jarvis_lifecycle: input.lifecycle,
    updated_at: new Date().toISOString(),
  }
  if (input.status) patch.status = input.status
  if (input.result) patch.result = { ...(row.result as object), ...input.result }

  if (input.purchases != null || input.spend != null) {
    patch.data_sufficiency = assessDataSufficiency({
      purchases: input.purchases ?? 0,
      spend: input.spend ?? 0,
      minimum_purchases: Number(row.minimum_purchases) || 5,
      minimum_spend: Number(row.minimum_spend) || 500,
    })
  }

  // Guard: cannot complete as winner on INSUFFICIENT
  if (
    input.lifecycle === 'DECISION' &&
    patch.data_sufficiency === 'INSUFFICIENT'
  ) {
    return {
      ok: false,
      error: 'Cannot decide winner with INSUFFICIENT data — mark INCONCLUSIVE instead.',
    }
  }

  const { data, error } = await admin
    .from('marketing_experiments')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, experiment: data }
}

export function analyzeExperiment(row: Record<string, unknown>): Record<string, unknown> {
  const sufficiency = (row.data_sufficiency as DataSufficiency) || 'INSUFFICIENT'
  const result = (row.result as Record<string, unknown>) || {}
  return {
    OBSERVED_RESULT: result.observed ?? 'No observed result stored yet.',
    QUANTITATIVE: result.metrics ?? 'Metrics not stored.',
    POSSIBLE_EXPLANATIONS: result.explanations ?? [
      'Multiple factors may explain the outcome — causality not established by design alone.',
    ],
    LIMITATIONS: row.limitations ?? [
      'Sample may be biased.',
      'External seasonality not controlled.',
    ],
    DATA_SUFFICIENCY: sufficiency,
    DECISION:
      sufficiency === 'INSUFFICIENT' || sufficiency === 'PRELIMINARY'
        ? 'Do not declare a winner yet.'
        : result.decision ?? 'Ready for human decision — not auto-applied.',
    note: 'Analysis only — does not enable live Meta/IG or bypass Phase 12.',
  }
}

export async function concludeExperiment(input: {
  id: string
  decision: string
  observed: string
  promote_lesson?: boolean
  actorId?: string | null
}): Promise<Record<string, unknown>> {
  const row = await getExperiment(input.id)
  if (!row) return { ok: false, error: 'not_found' }

  const sufficiency = assessDataSufficiency({
    purchases: Number((row.result as { purchases?: number })?.purchases) || 0,
    spend: Number((row.result as { spend?: number })?.spend) || 0,
    minimum_purchases: Number(row.minimum_purchases) || 5,
    minimum_spend: Number(row.minimum_spend) || 500,
  })

  if (sufficiency === 'INSUFFICIENT') {
    await transitionExperiment({
      id: input.id,
      lifecycle: 'INCONCLUSIVE',
      status: 'inconclusive',
      result: { observed: input.observed, decision: 'inconclusive', purchases: 0, spend: 0 },
    })
    return {
      ok: true,
      status: 'INCONCLUSIVE',
      note: 'Insufficient data — not promoted to operating rule.',
    }
  }

  await transitionExperiment({
    id: input.id,
    lifecycle: 'LEARNED',
    status: 'completed',
    result: {
      observed: input.observed,
      decision: input.decision,
      purchases: (row.result as { purchases?: number })?.purchases,
      spend: (row.result as { spend?: number })?.spend,
    },
    purchases: Number((row.result as { purchases?: number })?.purchases) || 5,
    spend: Number((row.result as { spend?: number })?.spend) || 500,
  })

  let memory: unknown = null
  if (input.promote_lesson) {
    const sample = Number((row.result as { purchases?: number })?.purchases) || 1
    // Never auto-promote to OPERATING_RULE from a single experiment
    if (canPromoteToOperatingRule({ sampleSize: sample, confidence: 'HIGH', source_type: 'EXPERIMENT' })) {
      /* threshold usually blocks single experiment */
    }
    try {
      const { writeStrategicMemory } = await import('@/lib/jarvis/memory/strategic')
      const { buildEvidenceItem } = await import('@/lib/jarvis/memory/strategic/evidence')
      const kind = canPromoteToPattern(sample) ? 'PATTERN' : 'LESSON'
      memory = await writeStrategicMemory({
        kind,
        level: kind === 'PATTERN' ? 2 : 4,
        title: `Experiment: ${row.name}`,
        statement: `${input.observed} Decision: ${input.decision}. Causality not established beyond experiment design limits.`,
        scope: row.funnel_id ? 'FUNNEL' : 'EXPERIMENT',
        scope_id: (row.funnel_id as string) ?? input.id,
        funnel_id: (row.funnel_id as string) ?? null,
        source: 'jarvis.experiments',
        source_type: 'EXPERIMENT',
        evidence: [
          buildEvidenceItem({
            source_type: 'EXPERIMENT',
            source_id: input.id,
            sample_size: sample,
            notes: input.decision,
          }),
        ],
        evidence_label: canPromoteToPattern(sample) ? 'REPEATED_PATTERN' : 'OBSERVED',
        confidence: sufficiency === 'STRONG' ? 'HIGH' : 'MEDIUM',
        causality: 'CAUSALITY_NOT_ESTABLISHED',
        sample_size: sample,
        tags: ['experiment_learning'],
      })
    } catch (e) {
      memory = { error: e instanceof Error ? e.message : 'memory_write_failed' }
    }
  }

  return {
    ok: true,
    status: 'LEARNED',
    data_sufficiency: sufficiency,
    memory,
    note: 'Single experiment does not auto-create OPERATING_RULE (Phase 14 gates).',
  }
}

export async function experimentsHealth(): Promise<Record<string, unknown>> {
  const rows = await listExperiments(100)
  const byLife: Record<string, number> = {}
  for (const r of rows) {
    const k = String(r.jarvis_lifecycle || r.status || 'unknown')
    byLife[k] = (byLife[k] || 0) + 1
  }
  return {
    total: rows.length,
    by_lifecycle: byLife,
    note: 'Phase 20 — no unlimited experiments; cost_limit_usd enforced at create time as metadata.',
  }
}

export function explainExperiment(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    hypothesis: row.hypothesis,
    funnel_id: row.funnel_id ?? 'UNCLASSIFIED',
    lifecycle: row.jarvis_lifecycle,
    status: row.status,
    data_sufficiency: row.data_sufficiency,
    analysis: analyzeExperiment(row),
    forbidden: [
      'Cannot raise own budget limits',
      'Cannot disable safety / enable live Meta or Instagram',
      'Cannot bypass approval',
    ],
  }
}
