import { getMarketingOverview } from '@/lib/ai-marketing/overview'
import { getPerformanceByFunnel, listFunnels } from '@/lib/ai-marketing/funnels'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'
import { isShopifyConfigured, shopifyOrderStats } from '@/lib/jarvis/shopify/client'
import { loadLurvoxRevenue } from '@/lib/jarvis/metrics/lurvox-revenue'
import {
  META_AD_PURCHASES_METRIC,
  SHOPIFY_STORE_COMMERCE_METRIC,
  dataSourcesForQuestion,
} from '@/lib/jarvis/metrics/source-of-truth'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { loadMetaIntegrationStatus, investigateMetaSyncPipeline } from '@/lib/jarvis/diagnostics/meta-sync-pipeline'
import {
  investigationSystemGuardrails,
  separateCommerceSystemsNote,
  shouldInvestigateMetaSyncFirst,
  shouldLoadShopifyForQuestion,
  sourcesLabel,
} from '@/lib/jarvis/reasoning/boundaries'
import {
  formatMemoryForPrompt,
  retrieveRelevantMemory,
} from '@/lib/jarvis/memory/retrieval'
import { z } from 'zod'

const investigationSchema = z.object({
  observed: z.array(z.string()).min(1).max(12),
  inferred: z.array(z.string()).max(8),
  uncertain: z.array(z.string()).max(8),
  recommendations: z.array(z.string()).max(6),
  confidence: z.enum(['low', 'medium', 'high']),
  /** @deprecated keep for older consumers — mirror of observed[0] */
  observation: z.string().optional(),
  evidence: z.array(z.string()).min(1).max(12),
  likely_causes: z.array(z.string()).max(6).optional(),
  recommended_action: z.string().optional(),
  action_required: z.boolean(),
  cost_risk: z.string(),
  caveats: z.array(z.string()).max(6),
})

export type InvestigateInput = {
  objective?: string
  question?: string
  days?: number
  systemsAllowed?: Array<'lurvox' | 'meta' | 'shopify' | 'instagram' | 'memory'>
  maxToolCalls?: number
  maxRuntimeMs?: number
  maxCostUsd?: number
  actorId?: string | null
}

/**
 * Cross-system investigation: LURVOX payments + Meta + funnels (+ Shopify/Instagram when relevant).
 * Returns OBSERVED / INFERRED / UNCERTAIN / RECOMMENDATION — never presents inference as fact.
 */
export async function investigateBusinessQuestion(input: InvestigateInput) {
  const started = Date.now()
  const question = (input.objective || input.question || '').trim()
  if (question.length < 5) {
    return { status: 'failed' as const, error: 'objective/question required' }
  }

  const maxCost = input.maxCostUsd ?? 0.25
  const maxRuntime = input.maxRuntimeMs ?? 90_000
  const maxCalls = Math.min(Math.max(input.maxToolCalls ?? 8, 1), 12)
  let toolsUsed = 0
  let costUsd = 0

  const gate = await assertAiBudgetAvailable(Math.min(0.15, maxCost))
  if (!gate.ok) {
    return {
      status: 'paused_budget' as const,
      error: gate.reason,
    }
  }

  const days = input.days ?? 7
  const sources = dataSourcesForQuestion(question)
  const allowed = new Set(input.systemsAllowed ?? ['lurvox', 'meta', 'shopify', 'instagram', 'memory'])
  const loadShopify =
    allowed.has('shopify') && shouldLoadShopifyForQuestion(question)
  const loadInstagram =
    allowed.has('instagram') && /\b(instagram|reel|organic|ig)\b/i.test(question)

  const evidence: { system: string; status: string; note: string; payload?: unknown }[] = []

  async function timedRead<T>(
    system: string,
    fn: () => Promise<T>
  ): Promise<T | { error: string }> {
    if (Date.now() - started > maxRuntime) {
      return { error: 'max_runtime_exceeded' }
    }
    if (toolsUsed >= maxCalls) {
      return { error: 'max_tool_calls_exceeded' }
    }
    if (costUsd >= maxCost) {
      return { error: 'max_cost_exceeded' }
    }
    toolsUsed += 1
    try {
      const result = await fn()
      evidence.push({ system, status: 'ok', note: `${system} read succeeded` })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : `${system} failed`
      evidence.push({ system, status: 'failed', note: message })
      return { error: message }
    }
  }

  const [overview, perf, funnels, creatives, meta, lurvox, memoryPack] = await Promise.all([
    allowed.has('meta')
      ? timedRead('meta.overview', () => getMarketingOverview())
      : Promise.resolve(null),
    allowed.has('meta')
      ? timedRead('meta.performance', () => getPerformanceByFunnel({ days }))
      : Promise.resolve(null),
    timedRead('funnels', () => listFunnels()),
    allowed.has('meta')
      ? timedRead('meta.creatives', () => listCreativePerformance({ days }))
      : Promise.resolve([]),
    allowed.has('meta')
      ? timedRead('meta.status', () => loadMetaIntegrationStatus())
      : Promise.resolve(null),
    allowed.has('lurvox')
      ? timedRead('lurvox.revenue', () => loadLurvoxRevenue({ preset: 'last_n_days', days }))
      : Promise.resolve(null),
    allowed.has('memory')
      ? timedRead('memory', () => retrieveRelevantMemory({ query: question, limit: 6 }))
      : Promise.resolve({ memories: [], conflicts: [], scanned: 0 }),
  ])

  let shopify: unknown = {
    loaded: false,
    note: loadShopify
      ? null
      : 'Shopify Admin not loaded — question did not ask about Shopify store commerce. LURVOX revenue is public.purchases only.',
  }
  if (loadShopify) {
    shopify = {
      loaded: true,
      configured: isShopifyConfigured(),
      note: isShopifyConfigured()
        ? 'Shopify store commerce only — separate from LURVOX Razorpay purchases.'
        : 'Shopify not configured (SHOPIFY_SHOP + SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET)',
    }
    if (isShopifyConfigured()) {
      const stats = await timedRead('shopify.orders', () => shopifyOrderStats(days))
      if (stats && typeof stats === 'object' && 'error' in stats) {
        shopify = {
          loaded: true,
          configured: true,
          ok: false,
          data_status: 'failed',
          error: (stats as { error: string }).error,
          note: 'Shopify stats failed. This is not ₹0 LURVOX revenue.',
        }
      } else if (stats && typeof stats === 'object' && 'ok' in stats && !(stats as { ok: boolean }).ok) {
        shopify = {
          loaded: true,
          configured: true,
          ...(stats as object),
          note: 'Shopify stats failed. This is not ₹0 LURVOX revenue.',
        }
      } else {
        shopify = { ...(shopify as object), ...(stats as object) }
      }
    }
  }

  let instagram: unknown = {
    loaded: false,
    note: loadInstagram
      ? null
      : 'Instagram not loaded for this question — ask explicitly or include Instagram in the objective.',
  }
  if (loadInstagram) {
    const ig = await timedRead('instagram.status', async () => {
      const { instagramStatus } = await import('@/lib/jarvis/instagram')
      return instagramStatus()
    })
    instagram = { loaded: true, result: ig }
  }

  const metaObj =
    meta && typeof meta === 'object' && !('error' in meta) ? (meta as { lastSyncAt?: string | null; configured?: boolean }) : null
  let meta_sync_investigation: unknown = null
  const prioritizeMeta = shouldInvestigateMetaSyncFirst({
    question,
    lastSyncAt: metaObj?.lastSyncAt ?? null,
    metaConfigured: metaObj?.configured,
  })
  if (allowed.has('meta') && (prioritizeMeta || sources.includes(META_AD_PURCHASES_METRIC))) {
    if (metaObj?.lastSyncAt == null) {
      meta_sync_investigation = await timedRead('meta.sync_investigate', () =>
        investigateMetaSyncPipeline(question)
      )
    }
  }

  const creativesList = Array.isArray(creatives) ? creatives : []
  const fatigued = creativesList.filter(
    (c: { classification?: string }) =>
      c.classification === 'FATIGUED' || c.classification === 'DECLINING'
  )
  const losers = creativesList.filter((c: { classification?: string }) => c.classification === 'LOSER')

  const memoryFormatted =
    memoryPack && typeof memoryPack === 'object' && 'memories' in memoryPack
      ? formatMemoryForPrompt(
          (memoryPack as Awaited<ReturnType<typeof retrieveRelevantMemory>>).memories,
          (memoryPack as Awaited<ReturnType<typeof retrieveRelevantMemory>>).conflicts
        )
      : { relevant: [], conflicts: [] }

  const funnelsList = Array.isArray(funnels) ? funnels : []
  const perfObj =
    perf && typeof perf === 'object' && !('error' in perf)
      ? (perf as Awaited<ReturnType<typeof getPerformanceByFunnel>>)
      : null
  const overviewObj =
    overview && typeof overview === 'object' && !('error' in overview)
      ? (overview as Awaited<ReturnType<typeof getMarketingOverview>>)
      : null
  const lurvoxObj =
    lurvox && typeof lurvox === 'object' && !('error' in lurvox)
      ? lurvox
      : { ok: false, data_status: 'failed', error: 'lurvox unavailable' }

  if (Date.now() - started > maxRuntime || costUsd >= maxCost) {
    return {
      status: 'paused_budget' as const,
      error: 'Investigation bounds exceeded before synthesis',
      objective: question,
      evidence,
      tools_used: evidence.map((e) => e.system),
      cost: costUsd,
      duration_ms: Date.now() - started,
    }
  }

  const { data, model } = await generateMarketingJson({
    systemPrompt: `You are Jarvis investigating LURVOX business performance.
Use ONLY provided evidence. Never invent Meta, Shopify, Instagram, or purchases numbers.
${investigationSystemGuardrails()}
${separateCommerceSystemsNote()}
Keep ₹99 and ₹1,699 funnels separate — never blend economics for decisions.
If lurvox_payments.data_status is failed/unavailable/unknown, say revenue is unavailable — never ₹0.
If a subsystem failed, put that in UNCERTAIN — do not invent a substitute number.
Separate clearly:
- OBSERVED = what changed in the data (facts only)
- INFERRED = hypotheses / possible explanations (never present as proven)
- UNCERTAIN = missing data, failed systems, what we do not know
- RECOMMENDATION = what to do next (safe reads first; significant writes need approval)
Do not claim causality — use "may", "possible contributor", "associated with", "followed by".
If meta_sync_investigation is present, prioritize those findings over unrelated Shopify commentary.
If memory_conflicts exist, mention them under UNCERTAIN or OBSERVED as conflicting records.`,
    userPrompt: JSON.stringify({
      objective: question,
      days,
      bounds: { maxCalls, maxRuntime, maxCost, toolsUsed },
      requested_sources: sources,
      requested_sources_label: sourcesLabel(sources),
      commerce_systems: separateCommerceSystemsNote(),
      lurvox_payments: lurvoxObj,
      funnels: funnelsList.map((f: { id: string; name: string; price_inr: number | null; target_cpa: number | null; max_acceptable_cpa: number | null; target_roas: number | null }) => ({
        id: f.id,
        name: f.name,
        price_inr: f.price_inr,
        target_cpa: f.target_cpa,
        max_acceptable_cpa: f.max_acceptable_cpa,
        target_roas: f.target_roas,
        note: 'price_inr is funnel config only — do not assign purchases to this funnel by amount',
      })),
      performance_by_funnel: perfObj?.byFunnel ?? [],
      unclassified: perfObj?.unclassified ?? null,
      blended_reporting_only: perfObj?.blended ?? null,
      overview_pending: overviewObj?.pendingApprovals,
      meta: metaObj,
      meta_sync_investigation,
      prioritize_meta_sync: prioritizeMeta,
      shopify,
      shopify_loaded: loadShopify,
      shopify_requested: sources.includes(SHOPIFY_STORE_COMMERCE_METRIC),
      instagram,
      memory: memoryFormatted,
      evidence_log: evidence,
      creative_fatigue: fatigued.slice(0, 8),
      creative_losers: losers.slice(0, 8),
    }),
    schema: investigationSchema,
    maxTokens: 2500,
  })

  costUsd += await recordCostUsage({
    category: 'chat',
    model,
    tokensIn: 2500,
    tokensOut: 900,
    metadata: { phase: 'investigate', question: question.slice(0, 120) },
  })

  const observed = data.observed?.length
    ? data.observed
    : data.observation
      ? [data.observation]
      : ['Insufficient structured observation returned']
  const inferred = data.inferred?.length
    ? data.inferred
    : data.likely_causes ?? []
  const uncertain = [
    ...(data.uncertain ?? []),
    ...evidence.filter((e) => e.status === 'failed').map((e) => `${e.system}: ${e.note}`),
  ]
  const recommendations = data.recommendations?.length
    ? data.recommendations
    : data.recommended_action
      ? [data.recommended_action]
      : []

  return {
    status: 'ok' as const,
    objective: question,
    evidence,
    observations: observed,
    hypotheses: inferred,
    uncertainties: uncertain,
    recommendations,
    confidence: data.confidence,
    tools_used: evidence.map((e) => e.system),
    cost: costUsd,
    duration_ms: Date.now() - started,
    // Legacy report shape for existing UI/tests
    report: {
      OBSERVED: observed,
      INFERRED: inferred,
      UNCERTAIN: uncertain,
      RECOMMENDATION: recommendations,
      OBSERVATION: observed[0],
      EVIDENCE: data.evidence,
      LIKELY_CAUSES: inferred,
      CONFIDENCE: data.confidence,
      RECOMMENDED_ACTION: recommendations[0] ?? '',
      ACTION_REQUIRED: data.action_required,
      COST_RISK: data.cost_risk,
      CAVEATS: data.caveats,
    },
    sources_used: {
      lurvox_payments: Boolean(
        lurvoxObj && typeof lurvoxObj === 'object' && 'ok' in lurvoxObj && (lurvoxObj as { ok: boolean }).ok
      ),
      meta: Boolean(metaObj?.configured),
      shopify: loadShopify && isShopifyConfigured(),
      shopify_loaded: loadShopify,
      instagram_loaded: loadInstagram,
      funnels: funnelsList.length,
      creatives: creativesList.length,
      requested_sources: sources,
      meta_sync_investigated: Boolean(meta_sync_investigation),
      memory_conflicts: memoryFormatted.conflicts.length,
      bounds: { maxCalls, toolsUsed, maxRuntime, duration_ms: Date.now() - started, maxCost, costUsd },
    },
  }
}
