import { createAdminClient } from '@/lib/supabase/admin'
import { getGuardrails } from '@/lib/ai-marketing/settings'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { analyticsReportSchema } from '@/lib/ai-marketing/validation/schemas'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { proposeActionsFromFindings } from '@/lib/ai-marketing/decision-engine'
import {
  getFunnelById,
  getPerformanceByFunnel,
  listFunnels,
} from '@/lib/ai-marketing/funnels'
import type { AnalyticsFinding, MarketingFunnel } from '@/lib/ai-marketing/types'

/**
 * Per-funnel rules (documented):
 * 1. Never apply Funnel A's CPA/ROAS thresholds to Funnel B.
 * 2. Insufficient data: spend < funnel.min_spend_before_pause.
 * 3. Winner: purchases >= funnel.min_purchases_for_winner AND CPA/ROAS vs THAT funnel's targets.
 * 4. Initial ROAS ≠ blended customer value (downstream tracked separately).
 * 5. Never compare raw CPA across funnels without offer value context.
 * 6. UNCLASSIFIED spend is reported but not optimized with offer economics.
 */
async function analyzeSingleFunnel(
  funnel: MarketingFunnel | null,
  opts?: { actorId?: string | null; days?: number }
): Promise<{
  funnel_id: string | null
  funnel_name: string
  summary: string
  findings: AnalyticsFinding[]
  winners: string[]
  losers: string[]
  insufficient_data: string[]
  decisionIds: string[]
}> {
  const admin = createAdminClient()
  const accountGuardrails = await getGuardrails()
  const days = opts?.days ?? funnel?.min_data_window_days ?? accountGuardrails.MIN_DATA_WINDOW_DAYS
  const since = new Date()
  since.setDate(since.getDate() - Math.max(days, 7))
  const sinceStr = since.toISOString().slice(0, 10)

  let query = admin.from('marketing_performance').select('*').gte('date', sinceStr)
  if (funnel) query = query.eq('funnel_id', funnel.id)
  else query = query.is('funnel_id', null)

  const { data: rows, error } = await query.order('date', { ascending: false }).limit(1000)
  if (error) throw new Error(error.message)

  const minSpend = funnel?.min_spend_before_pause ?? accountGuardrails.MIN_SPEND_BEFORE_PAUSE
  const minPurchases =
    funnel?.min_purchases_for_winner ?? accountGuardrails.MIN_PURCHASES_FOR_WINNER
  const targetCpa = funnel?.target_cpa ?? null
  const maxCpa = funnel?.max_acceptable_cpa ?? null
  const targetRoas = funnel?.target_roas ?? null
  const minRoas = funnel?.min_roas ?? null

  const byAd = new Map<
    string,
    {
      spend: number
      impressions: number
      clicks: number
      purchases: number
      revenue: number
      frequencyMax: number
    }
  >()
  for (const r of rows ?? []) {
    const key = r.meta_ad_id || r.ad_id || 'unknown'
    const cur = byAd.get(key) ?? {
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      revenue: 0,
      frequencyMax: 0,
    }
    cur.spend += Number(r.spend) || 0
    cur.impressions += Number(r.impressions) || 0
    cur.clicks += Number(r.clicks) || 0
    cur.purchases += Number(r.purchases) || 0
    cur.revenue += Number(r.revenue) || 0
    cur.frequencyMax = Math.max(cur.frequencyMax, Number(r.frequency) || 0)
    byAd.set(key, cur)
  }

  const adSummaries = [...byAd.entries()].map(([id, m]) => ({
    ad_id: id,
    ...m,
    cpa: m.purchases > 0 ? m.spend / m.purchases : null,
    initial_roas: m.spend > 0 ? m.revenue / m.spend : null,
    ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : null,
    data_status:
      m.spend < minSpend
        ? 'insufficient_data'
        : m.purchases >= minPurchases
          ? 'strong_evidence'
          : 'possible_issue',
  }))

  const funnelLabel = funnel?.name ?? 'UNCLASSIFIED'
  const systemPrompt = `You are the LURVOX Meta Ads Performance Analyst for ONE funnel only: ${funnelLabel}.

CRITICAL RULES:
- Analyze ONLY this funnel's economics. Do NOT apply another funnel's CPA/ROAS.
- Offer price: ${funnel?.price_inr ?? 'unknown'} INR
- Contribution margin (not equal to revenue): ${funnel?.contribution_margin_inr ?? 'unknown'} INR
- Target CPA: ${targetCpa ?? 'N/A'} | Max acceptable CPA: ${maxCpa ?? 'N/A'}
- Target ROAS (initial): ${targetRoas ?? 'N/A'} | Min ROAS: ${minRoas ?? 'N/A'}
- Min spend before pause: ${minSpend}
- Min purchases for winner: ${minPurchases}
- Initial ROAS uses ad conversion revenue only. Downstream/blended value is SEPARATE — never confuse them.
- Do NOT recommend PAUSE when spend < min spend.
- requires_human_approval = true for all Meta-changing recommendations.
- Correlation ≠ causation. Include caveats.
${funnel ? '' : '- This is UNCLASSIFIED spend — recommend classification, not optimization against offer CPA.'}`

  const { data } = await generateMarketingJson({
    systemPrompt,
    userPrompt: JSON.stringify({
      funnel: funnel
        ? {
            id: funnel.id,
            slug: funnel.slug,
            name: funnel.name,
            price_inr: funnel.price_inr,
            offer: funnel.offer,
            target_audience: funnel.target_audience,
            notes: funnel.notes,
          }
        : { name: 'UNCLASSIFIED' },
      ad_summaries: adSummaries.slice(0, 80),
      row_count: (rows ?? []).length,
    }),
    schema: analyticsReportSchema,
    maxTokens: 6000,
  })

  const findings = data.findings.map((f) => ({
    ...f,
    requires_human_approval: true,
    entity_type: f.entity_type ?? (funnel ? 'funnel' : 'unclassified'),
    entity_id: f.entity_id ?? funnel?.id,
    caveats: [
      ...(f.caveats ?? []),
      `Scoped to funnel: ${funnelLabel}`,
      'Initial ROAS ≠ blended customer value',
    ],
  }))

  const decisionIds = await proposeActionsFromFindings(findings, {
    actorId: opts?.actorId ?? null,
    inputSummary: {
      funnel_id: funnel?.id ?? null,
      funnel_name: funnelLabel,
      target_cpa: targetCpa,
      target_roas: targetRoas,
    },
    funnelId: funnel?.id ?? null,
  })

  await writeMarketingAudit({
    agent: 'analytics',
    decision: `performance_analysis:${funnel?.slug ?? 'unclassified'}`,
    reasoning: data.summary,
    confidence: 0.65,
    action: 'analysis',
    actor_id: opts?.actorId ?? null,
    input_summary: { funnel_id: funnel?.id, days },
    execution_result: { findings: findings.length, decision_ids: decisionIds },
  })

  return {
    funnel_id: funnel?.id ?? null,
    funnel_name: funnelLabel,
    summary: data.summary,
    findings,
    winners: data.winners,
    losers: data.losers,
    insufficient_data: data.insufficient_data,
    decisionIds,
  }
}

export async function runPerformanceAnalysis(opts?: {
  actorId?: string | null
  days?: number
  funnelId?: string | null
}): Promise<{
  funnels: Awaited<ReturnType<typeof analyzeSingleFunnel>>[]
  unclassified?: Awaited<ReturnType<typeof analyzeSingleFunnel>>
  crossFunnel?: {
    byFunnel: Awaited<ReturnType<typeof getPerformanceByFunnel>>['byFunnel']
    blended: Awaited<ReturnType<typeof getPerformanceByFunnel>>['blended']
    recommendations: AnalyticsFinding[]
    decisionIds: string[]
  }
}> {
  if (opts?.funnelId) {
    const funnel = await getFunnelById(opts.funnelId)
    if (!funnel) throw new Error('Funnel not found')
    const result = await analyzeSingleFunnel(funnel, opts)
    return { funnels: [result] }
  }

  const funnels = await listFunnels()
  const perFunnel: Awaited<ReturnType<typeof analyzeSingleFunnel>>[] = []
  for (const funnel of funnels) {
    perFunnel.push(await analyzeSingleFunnel(funnel, opts))
  }
  const unclassified = await analyzeSingleFunnel(null, opts)

  const perf = await getPerformanceByFunnel({ days: opts?.days ?? 30 })
  const crossRecommendations = await generateCrossFunnelRecommendations(perf, opts?.actorId)

  return {
    funnels: perFunnel,
    unclassified,
    crossFunnel: {
      byFunnel: perf.byFunnel,
      blended: perf.blended,
      recommendations: crossRecommendations.findings,
      decisionIds: crossRecommendations.decisionIds,
    },
  }
}

async function generateCrossFunnelRecommendations(
  perf: Awaited<ReturnType<typeof getPerformanceByFunnel>>,
  actorId?: string | null
): Promise<{ findings: AnalyticsFinding[]; decisionIds: string[] }> {
  const { data } = await generateMarketingJson({
    systemPrompt: `You are the LURVOX cross-funnel business analyst.
You already have independent funnel analyses. Now recommend budget allocation BETWEEN funnels.
Rules:
- Do NOT compare raw CPA across funnels without offer value (₹99 vs ₹1,699 are different economics).
- Distinguish initial ROAS vs blended customer value.
- Recommend INCREASE_FUNNEL_BUDGET / DECREASE_FUNNEL_BUDGET / CONTINUE_TESTING_FUNNELS / REALLOCATE_BUDGET_RECOMMENDATION.
- All recommendations require human approval.
- Never auto-move budget.`,
    userPrompt: JSON.stringify({
      by_funnel: perf.byFunnel,
      unclassified: perf.unclassified,
      blended: perf.blended,
    }),
    schema: analyticsReportSchema,
    maxTokens: 4000,
  })

  const findings = data.findings.map((f) => ({
    ...f,
    requires_human_approval: true,
    caveats: [
      ...(f.caveats ?? []),
      'Cross-funnel recommendation — approval required; no automatic budget move',
    ],
  }))

  const decisionIds = await proposeActionsFromFindings(findings, {
    actorId: actorId ?? null,
    inputSummary: { scope: 'cross_funnel', blended: perf.blended },
    funnelId: null,
  })

  return { findings, decisionIds }
}
