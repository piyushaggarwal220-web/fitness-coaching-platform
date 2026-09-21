import { getPerformanceByFunnel, listFunnels } from '@/lib/ai-marketing/funnels'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'
import { getGuardrails } from '@/lib/ai-marketing/settings'
import { proposeActionsFromFindings } from '@/lib/ai-marketing/decision-engine'
import type { AnalyticsFinding } from '@/lib/ai-marketing/types'

/**
 * Human-approval budget recommendations between/within funnels.
 * Does NOT move money automatically.
 */
export async function buildBudgetRecommendations(opts?: {
  actorId?: string | null
  days?: number
}): Promise<{
  recommendations: {
    funnel_id: string
    funnel_name: string
    current_daily_budget: number | null
    recommended_daily_budget: number | null
    reason: string
    action: 'INCREASE_FUNNEL_BUDGET' | 'DECREASE_FUNNEL_BUDGET' | 'CONTINUE_TESTING_FUNNELS' | 'NO_ACTION'
    confidence: number
  }[]
  decisionIds: string[]
}> {
  const [funnels, perf, creatives, account] = await Promise.all([
    listFunnels(),
    getPerformanceByFunnel({ days: opts?.days ?? 14 }),
    listCreativePerformance({ days: opts?.days ?? 14 }),
    getGuardrails(),
  ])

  const recommendations: {
    funnel_id: string
    funnel_name: string
    current_daily_budget: number | null
    recommended_daily_budget: number | null
    reason: string
    action: 'INCREASE_FUNNEL_BUDGET' | 'DECREASE_FUNNEL_BUDGET' | 'CONTINUE_TESTING_FUNNELS' | 'NO_ACTION'
    confidence: number
  }[] = []

  const findings: AnalyticsFinding[] = []

  for (const funnel of funnels) {
    const summary = perf.byFunnel.find((f) => f.funnel_id === funnel.id)
    if (!summary) continue

    const funnelCreatives = creatives.filter((c) => c.funnel_id === funnel.id)
    const winners = funnelCreatives.filter((c) => c.classification === 'WINNER').length
    const losers = funnelCreatives.filter((c) => c.classification === 'LOSER').length
    const fatigued = funnelCreatives.filter((c) => c.classification === 'FATIGUED').length
    const current = funnel.daily_budget_inr

    let action: (typeof recommendations)[0]['action'] = 'CONTINUE_TESTING_FUNNELS'
    let recommended = current
    let reason = 'Continue collecting data within funnel economics.'
    let confidence = 0.45

    if (summary.spend < funnel.min_spend_before_pause) {
      action = 'CONTINUE_TESTING_FUNNELS'
      reason = `Insufficient spend (${summary.spend}) vs min ${funnel.min_spend_before_pause}. Keep testing.`
      confidence = 0.55
    } else if (
      summary.cpa != null &&
      summary.cpa <= funnel.target_cpa &&
      summary.initial_roas != null &&
      summary.initial_roas >= funnel.target_roas &&
      winners > 0
    ) {
      const bump = Math.min(
        funnel.max_budget_increase_percent,
        account.MAX_BUDGET_INCREASE_PERCENT
      )
      recommended = current != null ? Math.round(current * (1 + bump / 100)) : current
      if (
        funnel.max_daily_budget_inr != null &&
        recommended != null &&
        recommended > funnel.max_daily_budget_inr
      ) {
        recommended = funnel.max_daily_budget_inr
      }
      action = 'INCREASE_FUNNEL_BUDGET'
      reason = `CPA ${summary.cpa} <= target ${funnel.target_cpa}, ROAS ${summary.initial_roas} >= ${funnel.target_roas}, winners=${winners}. Propose +${bump}% (approval required).`
      confidence = 0.7
    } else if (
      summary.cpa != null &&
      summary.cpa > funnel.max_acceptable_cpa &&
      summary.spend >= funnel.min_spend_before_pause
    ) {
      const cut = Math.min(
        funnel.max_budget_decrease_percent,
        account.MAX_BUDGET_DECREASE_PERCENT
      )
      recommended = current != null ? Math.round(current * (1 - cut / 100)) : current
      action = 'DECREASE_FUNNEL_BUDGET'
      reason = `CPA ${summary.cpa} > max ${funnel.max_acceptable_cpa} with sufficient spend. Losers=${losers}, fatigued=${fatigued}. Propose -${cut}% (approval required).`
      confidence = 0.72
    } else if (
      summary.cpa != null &&
      summary.cpa > funnel.target_cpa &&
      summary.cpa <= funnel.max_acceptable_cpa
    ) {
      action = 'CONTINUE_TESTING_FUNNELS'
      reason = `CPA ${summary.cpa} between target ${funnel.target_cpa} and max ${funnel.max_acceptable_cpa}. Inefficient but not auto-pause. Create/test creatives.`
      confidence = 0.6
    }

    recommendations.push({
      funnel_id: funnel.id,
      funnel_name: funnel.name,
      current_daily_budget: current,
      recommended_daily_budget: recommended,
      reason,
      action,
      confidence,
    })

    if (action === 'INCREASE_FUNNEL_BUDGET' || action === 'DECREASE_FUNNEL_BUDGET' || action === 'CONTINUE_TESTING_FUNNELS') {
      findings.push({
        issue: `${funnel.name}: ${action}`,
        evidence: [reason, `Spend ${summary.spend}`, `CPA ${summary.cpa}`, `ROAS ${summary.initial_roas}`],
        evidence_strength:
          confidence >= 0.7 ? 'strong_evidence' : 'possible_issue',
        recommendation: reason,
        recommended_action: action,
        confidence,
        estimated_impact_category: 'medium',
        risk_level: action === 'INCREASE_FUNNEL_BUDGET' ? 'medium' : 'low',
        entity_type: 'funnel',
        entity_id: funnel.id,
        requires_human_approval: true,
        caveats: [
          'Budget recommendation only — no automatic transfer between funnels',
          'Uses funnel economics from marketing_funnels',
        ],
      })
    }
  }

  const decisionIds = await proposeActionsFromFindings(findings, {
    actorId: opts?.actorId ?? null,
    inputSummary: { scope: 'budget_recommendations' },
    funnelId: null,
  })

  return { recommendations, decisionIds }
}
