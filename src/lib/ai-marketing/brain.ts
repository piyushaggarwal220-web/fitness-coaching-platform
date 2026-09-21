import { createAdminClient } from '@/lib/supabase/admin'
import { getBrandContext, getGuardrails, getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { decisionBatchSchema } from '@/lib/ai-marketing/validation/schemas'
import { proposeStructuredDecisions } from '@/lib/ai-marketing/decision-engine'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { runPerformanceAnalysis } from '@/lib/ai-marketing/agents/analytics'
import { analyzeFunnel } from '@/lib/ai-marketing/agents/funnel'
import { getPerformanceByFunnel, listFunnels } from '@/lib/ai-marketing/funnels'
import { buildDailyFunnelReport } from '@/lib/ai-marketing/reporting/daily-report'

/**
 * Marketing Brain operates on funnel_id — never a single global LURVOX offer.
 */
export async function runMarketingBrain(opts?: { actorId?: string | null }) {
  const admin = createAdminClient()
  const [brand, accountGuardrails, autonomy, funnels, perf] = await Promise.all([
    getBrandContext(),
    getGuardrails(),
    getAutonomyLevel(),
    listFunnels(),
    getPerformanceByFunnel({ days: 14 }),
  ])

  const since = new Date()
  since.setDate(since.getDate() - 14)
  const sinceDate = since.toISOString().slice(0, 10)

  const [{ data: creatives }, { data: experiments }, { data: priorDecisions }] =
    await Promise.all([
      admin
        .from('marketing_creatives')
        .select('id, name, angle, status, hook, funnel_id')
        .order('created_at', { ascending: false })
        .limit(40),
      admin
        .from('marketing_experiments')
        .select('id, name, hypothesis, status, ai_conclusion, funnel_id')
        .order('created_at', { ascending: false })
        .limit(20),
      admin
        .from('marketing_ai_decisions')
        .select('decision, recommended_action, status, confidence, funnel_id')
        .order('created_at', { ascending: false })
        .limit(30),
    ])

  const siteFunnel = await analyzeFunnel({ actorId: opts?.actorId ?? null })

  const { data } = await generateMarketingJson({
    systemPrompt: `You are the LURVOX Marketing Brain.
LURVOX has MULTIPLE independent acquisition funnels with DIFFERENT economics.
Never use one global TARGET_CPA. Never compare raw CPA across funnels without offer value.
Distinguish Initial ROAS vs Blended customer value.
For each decision, set entity_type/entity_id to the funnel when relevant.
Prefer funnel-scoped actions: INCREASE_FUNNEL_BUDGET, DECREASE_FUNNEL_BUDGET, CONTINUE_TESTING_FUNNELS, CREATE_NEW_CREATIVE, INVESTIGATE_FUNNEL.
Budget moves between funnels require human approval.`,
    userPrompt: JSON.stringify({
      brand,
      account_guardrails: accountGuardrails,
      autonomy_level: autonomy,
      funnels: funnels.map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        price_inr: f.price_inr,
        contribution_margin_inr: f.contribution_margin_inr,
        target_cpa: f.target_cpa,
        max_acceptable_cpa: f.max_acceptable_cpa,
        target_roas: f.target_roas,
        min_roas: f.min_roas,
        daily_budget_inr: f.daily_budget_inr,
        target_audience: f.target_audience,
        notes: f.notes,
      })),
      performance_by_funnel: perf.byFunnel,
      unclassified: perf.unclassified,
      blended: perf.blended,
      site_funnel_diagnosis: siteFunnel.diagnosis,
      creatives: creatives ?? [],
      experiments: experiments ?? [],
      prior_decisions: priorDecisions ?? [],
      performance_window_start: sinceDate,
    }),
    schema: decisionBatchSchema,
    maxTokens: 5000,
  })

  const decisionIds = await proposeStructuredDecisions(data.decisions, {
    agent: 'brain',
    actorId: opts?.actorId ?? null,
  })

  await writeMarketingAudit({
    agent: 'brain',
    decision: 'strategy_cycle_multi_funnel',
    reasoning: `Produced ${data.decisions.length} structured decisions across ${funnels.length} funnels`,
    action: 'analysis',
    autonomy_level: autonomy,
    actor_id: opts?.actorId ?? null,
    execution_result: { decision_ids: decisionIds, funnel_count: funnels.length },
  })

  return {
    decisions: data.decisions,
    decisionIds,
    funnels: perf.byFunnel,
    blended: perf.blended,
    siteFunnel: siteFunnel.diagnosis,
  }
}

export async function runDailyMarketingCycle(opts?: { actorId?: string | null }) {
  const analysis = await runPerformanceAnalysis({ actorId: opts?.actorId ?? null })
  const brain = await runMarketingBrain({ actorId: opts?.actorId ?? null })
  const { buildBudgetRecommendations } = await import(
    '@/lib/ai-marketing/budget-recommendations'
  )
  const budget = await buildBudgetRecommendations({ actorId: opts?.actorId ?? null })
  const report = await buildDailyFunnelReport({
    actorId: opts?.actorId ?? null,
    analysis,
    brain,
  })
  return { analysis, brain, budget, report }
}
