import { createAdminClient } from '@/lib/supabase/admin'
import { getMarketingOverview } from '@/lib/ai-marketing/overview'
import { listFunnels } from '@/lib/ai-marketing/funnels'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { loadMetaIntegrationStatus } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { recentMemorySummaries } from '@/lib/jarvis/memory/business-memory'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { toolCatalogForPrompt } from '@/lib/jarvis/tools/registry'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { jarvisMetricOperatorNotes } from '@/lib/jarvis/metrics/source-of-truth'

export async function buildJarvisContext(conversationId?: string | null) {
  ensureJarvisToolsRegistered()

  const admin = createAdminClient()
  const [
    overview,
    funnels,
    autonomy,
    cost,
    budgets,
    memory,
    approvals,
    meta,
  ] = await Promise.all([
    getMarketingOverview().catch(() => null),
    listFunnels().catch(() => []),
    getAutonomyLevel(),
    getCostDashboard(),
    getJarvisBudgets(),
    recentMemorySummaries(10),
    listPendingApprovals(10),
    loadMetaIntegrationStatus().catch(() => null),
  ])

  let history: { role: string; content: string }[] = []
  if (conversationId) {
    const { data } = await admin
      .from('jarvis_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(30)
    history = (data ?? []).map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 2000),
    }))
  }

  return {
    brand: 'LURVOX',
    role: 'Jarvis — AI Business Operator',
    loop: 'OBSERVE → THINK → DECIDE → ACT → ASK WHEN NECESSARY → LEARN',
    rules: [
      'Never blend ₹99 and ₹1,699 funnel economics. Never infer funnel_id from purchase amount.',
      'Never invent Meta/performance numbers — use tools.',
      'Never execute SIGNIFICANT/DANGEROUS actions without permission engine.',
      'Never raise your own AI budget or disable audit.',
      'LIVE_META_EXECUTION_ENABLED must stay respected.',
      'If nothing meaningful changed, say so and DO NOTHING expensive.',
      'Prefer registered tools over speculation.',
      'If the user asks why a number, tool, or recommendation is wrong, call system.why or system.diagnose and investigate live — do not explain from memory.',
      'Never convert API failure, null, or unavailable data into 0. Use data_status. Do not make business conclusions from failed/unavailable data.',
      'Diagnostics may investigate automatically. Code, schema, credentials, permissions, Meta campaigns, Shopify writes, and deploys require approval.',
      'LURVOX cash (public.purchases) and Shopify Admin are separate. Do not reconcile them without a verified relationship.',
      'If Meta lastSyncAt is null, investigate Meta sync before unrelated Shopify reporting.',
      ...jarvisMetricOperatorNotes(),
    ],
    autonomy_level: autonomy,
    live_meta_execution: liveMetaExecutionEnabled(),
    meta_status: meta,
    funnels: funnels.map((f) => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      price_inr: f.price_inr,
      target_cpa: f.target_cpa,
      max_acceptable_cpa: f.max_acceptable_cpa,
      target_roas: f.target_roas,
      daily_budget_inr: f.daily_budget_inr,
    })),
    overview_summary: overview
      ? {
          byFunnel: overview.byFunnel,
          unclassified: overview.unclassified,
          blended_note: 'Blended totals are reporting only — do not optimize against blended CPA.',
          pendingApprovals: overview.pendingApprovals,
        }
      : null,
    cost,
    budgets,
    memory,
    pending_jarvis_approvals: approvals.map((a) => ({
      id: a.id,
      action: a.action_label,
      risk: a.risk_level,
      tool: a.tool_name,
    })),
    tools: toolCatalogForPrompt(),
    history,
  }
}
