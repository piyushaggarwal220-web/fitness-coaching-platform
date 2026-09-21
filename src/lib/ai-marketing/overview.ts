import { createAdminClient } from '@/lib/supabase/admin'
import { getAutonomyLevel, getGuardrails, getSetting } from '@/lib/ai-marketing/settings'
import { getMetaIntegrationStatus } from '@/lib/ai-marketing/meta/client'
import { getPerformanceByFunnel, listFunnels } from '@/lib/ai-marketing/funnels'

export async function getMarketingOverview() {
  const admin = createAdminClient()
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceDate = since.toISOString().slice(0, 10)

  const [
    perfByFunnel,
    funnels,
    { count: pendingActions },
    { count: pendingDecisions },
    { data: recentDecisions },
    { data: experiments },
    { count: unclassifiedCampaigns },
    autonomy,
    accountGuardrails,
    metaState,
  ] = await Promise.all([
    getPerformanceByFunnel({ days: 30 }),
    listFunnels(),
    admin
      .from('marketing_ai_actions')
      .select('id', { count: 'exact', head: true })
      .eq('approval_status', 'pending'),
    admin
      .from('marketing_ai_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    admin
      .from('marketing_ai_decisions')
      .select('id, decision, recommended_action, confidence, risk_level, status, created_at, funnel_id')
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('marketing_experiments')
      .select('id, name, status, hypothesis, funnel_id')
      .in('status', ['running', 'draft'])
      .limit(10),
    admin
      .from('marketing_campaigns')
      .select('id', { count: 'exact', head: true })
      .is('funnel_id', null),
    getAutonomyLevel(),
    getGuardrails(),
    getSetting<{ last_sync_at?: string | null; last_sync_error?: string | null }>(
      'meta_integration',
      {}
    ),
  ])

  const { data: fatigued } = await admin
    .from('marketing_performance')
    .select('meta_ad_id, frequency, date, funnel_id')
    .gte('date', sinceDate)
    .gte('frequency', accountGuardrails.CREATIVE_FATIGUE_THRESHOLD)
    .limit(20)

  const meta = getMetaIntegrationStatus(metaState)

  // Winners/losers evaluated per-funnel thresholds
  const { data: recentPerf } = await admin
    .from('marketing_performance')
    .select('*')
    .gte('date', sinceDate)
    .limit(500)

  const funnelMap = new Map(funnels.map((f) => [f.id, f]))
  const winners = (recentPerf ?? [])
    .filter((r) => {
      if (!r.funnel_id || Number(r.purchases) <= 0) return false
      const f = funnelMap.get(r.funnel_id)
      if (!f) return false
      return Number(r.roas) >= f.target_roas
    })
    .slice(0, 5)

  const losers = (recentPerf ?? [])
    .filter((r) => {
      if (!r.funnel_id) return false
      const f = funnelMap.get(r.funnel_id)
      if (!f) return false
      if (Number(r.spend) < f.min_spend_before_pause) return false
      return (
        Number(r.purchases) === 0 ||
        (r.cpa != null && Number(r.cpa) > f.max_acceptable_cpa)
      )
    })
    .slice(0, 5)

  return {
    totals: perfByFunnel.blended,
    byFunnel: perfByFunnel.byFunnel,
    unclassified: perfByFunnel.unclassified,
    funnels,
    pendingApprovals: pendingActions ?? 0,
    pendingDecisions: pendingDecisions ?? 0,
    recentDecisions: recentDecisions ?? [],
    activeExperiments: experiments ?? [],
    winners,
    losers,
    creativeFatigueSignals: fatigued ?? [],
    unclassifiedCampaignCount: unclassifiedCampaigns ?? 0,
    autonomyLevel: autonomy,
    /** Account-level caps only — CPA/ROAS are per-funnel */
    accountGuardrails,
    meta,
    isMockData: (recentPerf ?? []).some((r) => r.is_mock),
  }
}
