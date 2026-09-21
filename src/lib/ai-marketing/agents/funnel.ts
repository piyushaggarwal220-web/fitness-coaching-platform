import { createAdminClient } from '@/lib/supabase/admin'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { funnelDiagnosisSchema } from '@/lib/ai-marketing/validation/schemas'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { aggregatePerformance, calcCpa, calcRoas, safeDivide } from '@/lib/ai-marketing/metrics'

/**
 * Connect Meta ad performance to LURVOX funnel tables (purchases, profiles).
 * Distinguishes AD vs FUNNEL vs OFFER vs TRACKING problems.
 */
export async function analyzeFunnel(opts?: { days?: number; actorId?: string | null }) {
  const admin = createAdminClient()
  const days = opts?.days ?? 14
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()
  const sinceDate = sinceIso.slice(0, 10)

  const [{ data: perf }, { data: purchases }, { count: onboardingPending }, { count: plansDelivered }] =
    await Promise.all([
      admin.from('marketing_performance').select('*').gte('date', sinceDate),
      admin
        .from('purchases')
        .select('id, amount_paise, created_at, status')
        .gte('created_at', sinceIso)
        .limit(2000),
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .eq('onboarding_complete', false),
      admin
        .from('plans')
        .select('id', { count: 'exact', head: true })
        .not('delivered_at', 'is', null)
        .gte('delivered_at', sinceIso),
    ])

  const totals = aggregatePerformance(perf ?? [])
  const paidPurchases = (purchases ?? []).filter((p) => {
    const status = String(p.status ?? '').toLowerCase()
    return status === 'captured' || status === 'paid' || status === 'success'
  })

  const revenueFromPurchases = paidPurchases.reduce((sum, p) => {
    if (typeof p.amount_paise === 'number') return sum + p.amount_paise / 100
    return sum
  }, 0)

  const snapshot = {
    date: new Date().toISOString().slice(0, 10),
    ad_clicks: totals.clicks,
    landing_views: null as number | null,
    checkout_starts: null as number | null,
    purchases: paidPurchases.length,
    onboarding_started: null as number | null,
    onboarding_completed: null as number | null,
    plans_delivered: plansDelivered ?? 0,
    renewals: 0,
    spend: totals.spend,
    revenue: revenueFromPurchases || totals.revenue,
    aov: safeDivide(revenueFromPurchases || totals.revenue, paidPurchases.length || totals.purchases),
    cpa: calcCpa(totals.spend, paidPurchases.length || totals.purchases),
    roas: calcRoas(revenueFromPurchases || totals.revenue, totals.spend),
    metadata: {
      onboarding_pending: onboardingPending ?? 0,
      meta_purchases: totals.purchases,
      store_purchases: paidPurchases.length,
      days,
    },
  }

  await admin.from('marketing_funnel_snapshots').upsert(
    {
      date: snapshot.date,
      ad_clicks: snapshot.ad_clicks,
      purchases: snapshot.purchases,
      plans_delivered: snapshot.plans_delivered,
      spend: snapshot.spend,
      revenue: snapshot.revenue,
      aov: snapshot.aov,
      cpa: snapshot.cpa,
      roas: snapshot.roas,
      metadata: snapshot.metadata,
    },
    { onConflict: 'date' }
  )

  const { data: diagnosis } = await generateMarketingJson({
    systemPrompt: `You are the LURVOX Funnel Intelligence agent.
Decide primary_problem among: ad, funnel, offer, tracking, insufficient_data.
Rules:
- Strong CTR + weak purchases → likely funnel or offer, NOT automatically ads.
- Meta purchases diverge from store purchases → tracking problem possible.
- Low spend → insufficient_data.
Do not blame ads by default.`,
    userPrompt: JSON.stringify(snapshot),
    schema: funnelDiagnosisSchema,
  })

  await writeMarketingAudit({
    agent: 'funnel',
    decision: diagnosis.primary_problem,
    reasoning: diagnosis.reason,
    confidence: diagnosis.confidence,
    action: 'INVESTIGATE_FUNNEL',
    actor_id: opts?.actorId ?? null,
    input_summary: snapshot,
    execution_result: diagnosis,
  })

  return { snapshot, diagnosis }
}
