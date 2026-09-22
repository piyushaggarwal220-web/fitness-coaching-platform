/**
 * Instagram content research — reuses research.objective / Brave Search.
 * Separates sourced facts, Jarvis inference, and recommendations.
 */

import { assertAiBudgetAvailable } from '@/lib/jarvis/cost/usage'
import { runObjectiveResearch } from '@/lib/jarvis/research/research-agent'
import { writeInstagramAudit } from '@/lib/jarvis/instagram/audit'

/** Pure payload when AI/research budget is exhausted — used by tools + tests. */
export function instagramBudgetExhaustedResult(reason: string, retrieved_at = new Date().toISOString()) {
  return {
    ok: false as const,
    source: 'research.objective',
    data_status: 'unavailable' as const,
    retrieved_at,
    period: null,
    timezone: null,
    value: null,
    note: reason,
    error: reason,
    sourced_facts: [] as string[],
    jarvis_inference: [] as string[],
    jarvis_recommendation: [] as string[],
  }
}

export async function researchInstagramTrends(input: {
  focus?:
    | 'fitness_content_trends'
    | 'reels_trends'
    | 'topic_opportunities'
    | 'audience_patterns'
    | 'public_competitor_observations'
  question?: string
  decisionContext?: string
  actorId?: string | null
  maxBudgetUsd?: number
}) {
  const retrieved_at = new Date().toISOString()
  const focus = input.focus ?? 'fitness_content_trends'

  const gate = await assertAiBudgetAvailable(Math.min(input.maxBudgetUsd ?? 0.35, 0.5))
  if (!gate.ok) {
    await writeInstagramAudit({
      action: 'instagram.research_trends',
      target: focus,
      actor: input.actorId ?? 'jarvis',
      approval_state: null,
      result: 'budget_exhausted',
      provider_response_status: null,
      error_redacted: gate.reason,
    })
    return instagramBudgetExhaustedResult(gate.reason, retrieved_at)
  }

  const question =
    input.question?.trim() ||
    ({
      fitness_content_trends:
        'What are current fitness content trends on Instagram and short-form video in 2026?',
      reels_trends: 'What Instagram Reels formats and hooks are trending for fitness brands?',
      topic_opportunities:
        'What fitness Instagram topic opportunities exist for a coaching brand like LURVOX in India?',
      audience_patterns:
        'What public audience/content patterns appear for fitness Instagram accounts targeting beginners?',
      public_competitor_observations:
        'What publicly observable content patterns appear among fitness Instagram creators (public posts only)?',
    } as const)[focus]

  const decisionContext =
    input.decisionContext?.trim() ||
    'Jarvis Instagram Operator is choosing organic content topics. Prefer public sources. Do not invent private competitor metrics.'

  const research = await runObjectiveResearch({
    objective: `Instagram content research (${focus}) for LURVOX organic planning`,
    decisionContext,
    question,
    maxCostUsd: input.maxBudgetUsd ?? 0.35,
    actorId: input.actorId,
  })

  const sourced_facts = (research.key_findings ?? []).map((f) => `FACT: ${f}`)
  const jarvis_inference = research.conclusion
    ? [`INFERENCE: ${research.conclusion}`]
    : ([] as string[])
  const jarvis_recommendation = research.decision_influence
    ? [`RECOMMENDATION: ${research.decision_influence}`]
    : ([] as string[])

  await writeInstagramAudit({
    action: 'instagram.research_trends',
    target: focus,
    actor: input.actorId ?? 'jarvis',
    approval_state: null,
    result: research.status,
    provider_response_status: null,
    extra: {
      research_status: research.status,
      spent_usd: research.spent_usd,
      sources: research.sources?.length ?? 0,
    },
  })

  const ok =
    research.status === 'completed' ||
    research.status === 'stopped_sufficient' ||
    research.status === 'reused'

  return {
    ok,
    source: 'research.objective',
    data_status: ok
      ? ('verified' as const)
      : research.status === 'not_configured'
        ? ('unavailable' as const)
        : research.status === 'stopped_budget'
          ? ('unavailable' as const)
          : ('failed' as const),
    retrieved_at,
    period: null,
    timezone: null,
    value: {
      focus,
      research_status: research.status,
      confidence: research.confidence ?? null,
      sources: research.sources ?? [],
      spent_usd: research.spent_usd,
      stop_reason: research.stop_reason ?? null,
    },
    note: 'Research separates sourced facts, Jarvis inference, and recommendations. Public observations only.',
    error: research.error,
    sourced_facts,
    jarvis_inference,
    jarvis_recommendation,
  }
}
