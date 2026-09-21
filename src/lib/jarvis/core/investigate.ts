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
import { z } from 'zod'

const investigationSchema = z.object({
  observation: z.string(),
  evidence: z.array(z.string()).min(1).max(12),
  likely_causes: z.array(z.string()).max(6),
  confidence: z.enum(['low', 'medium', 'high']),
  recommended_action: z.string(),
  action_required: z.boolean(),
  cost_risk: z.string(),
  caveats: z.array(z.string()).max(6),
})

/**
 * Cross-system investigation: LURVOX payments + Meta + funnels (+ Shopify only if asked).
 * Business revenue is public.purchases. Does not invent causality.
 */
export async function investigateBusinessQuestion(input: {
  question: string
  days?: number
  actorId?: string | null
}) {
  const gate = await assertAiBudgetAvailable(0.15)
  if (!gate.ok) {
    return {
      status: 'paused_budget' as const,
      error: gate.reason,
    }
  }

  const days = input.days ?? 7
  const sources = dataSourcesForQuestion(input.question)
  const loadShopify = shouldLoadShopifyForQuestion(input.question)

  const [overview, perf, funnels, creatives, meta, lurvox] = await Promise.all([
    getMarketingOverview().catch(() => null),
    getPerformanceByFunnel({ days }).catch(() => null),
    listFunnels().catch(() => []),
    listCreativePerformance({ days }).catch(() => []),
    loadMetaIntegrationStatus().catch(() => null),
    loadLurvoxRevenue({ preset: 'last_n_days', days }),
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
      try {
        const stats = await shopifyOrderStats(days)
        shopify = { ...(shopify as object), ...stats }
        if (!stats.ok) {
          shopify = {
            loaded: true,
            configured: true,
            ok: false,
            data_status: stats.data_status,
            error: stats.error,
            note: 'Shopify stats failed. This is not ₹0 LURVOX revenue.',
          }
        }
      } catch (err) {
        shopify = {
          loaded: true,
          configured: true,
          ok: false,
          data_status: 'failed',
          error: err instanceof Error ? err.message : 'Shopify read failed',
          note: 'Shopify stats failed. This is not ₹0 LURVOX revenue.',
        }
      }
    }
  }

  let meta_sync_investigation: unknown = null
  const prioritizeMeta = shouldInvestigateMetaSyncFirst({
    question: input.question,
    lastSyncAt: meta?.lastSyncAt ?? null,
    metaConfigured: meta?.configured,
  })
  if (prioritizeMeta || sources.includes(META_AD_PURCHASES_METRIC)) {
    if (meta?.lastSyncAt == null) {
      meta_sync_investigation = await investigateMetaSyncPipeline(input.question).catch((err) => ({
        error: err instanceof Error ? err.message : 'Meta sync investigation failed',
        note: 'Investigation path failed; do not invent a Meta root cause.',
      }))
    }
  }

  const fatigued = creatives.filter(
    (c) => c.classification === 'FATIGUED' || c.classification === 'DECLINING'
  )
  const losers = creatives.filter((c) => c.classification === 'LOSER')

  const { data, model } = await generateMarketingJson({
    systemPrompt: `You are Jarvis investigating LURVOX business performance.
Use ONLY provided evidence. Never invent Meta, Shopify, or purchases numbers.
${investigationSystemGuardrails()}
${separateCommerceSystemsNote()}
Keep ₹99 and ₹1,699 funnels separate — never blend economics for decisions.
If lurvox_payments.data_status is failed/unavailable/unknown, say revenue is unavailable — never ₹0.
If evidence is insufficient, say so with low confidence.
Do not claim causality — list likely causes as hypotheses.
If meta_sync_investigation is present, prioritize those findings over unrelated Shopify commentary.`,
    userPrompt: JSON.stringify({
      question: input.question,
      days,
      requested_sources: sources,
      requested_sources_label: sourcesLabel(sources),
      commerce_systems: separateCommerceSystemsNote(),
      lurvox_payments: lurvox,
      funnels: funnels.map((f) => ({
        id: f.id,
        name: f.name,
        price_inr: f.price_inr,
        target_cpa: f.target_cpa,
        max_acceptable_cpa: f.max_acceptable_cpa,
        target_roas: f.target_roas,
        note: 'price_inr is funnel config only — do not assign purchases to this funnel by amount',
      })),
      performance_by_funnel: perf?.byFunnel ?? [],
      unclassified: perf?.unclassified ?? null,
      blended_reporting_only: perf?.blended ?? null,
      overview_pending: overview?.pendingApprovals,
      meta,
      meta_sync_investigation,
      prioritize_meta_sync: prioritizeMeta,
      shopify,
      shopify_loaded: loadShopify,
      shopify_requested: sources.includes(SHOPIFY_STORE_COMMERCE_METRIC),
      creative_fatigue: fatigued.slice(0, 8),
      creative_losers: losers.slice(0, 8),
    }),
    schema: investigationSchema,
    maxTokens: 2500,
  })

  await recordCostUsage({
    category: 'chat',
    model,
    tokensIn: 2500,
    tokensOut: 900,
    metadata: { phase: 'investigate', question: input.question.slice(0, 120) },
  })

  return {
    status: 'ok' as const,
    report: {
      OBSERVATION: data.observation,
      EVIDENCE: data.evidence,
      LIKELY_CAUSES: data.likely_causes,
      CONFIDENCE: data.confidence,
      RECOMMENDED_ACTION: data.recommended_action,
      ACTION_REQUIRED: data.action_required,
      COST_RISK: data.cost_risk,
      CAVEATS: data.caveats,
    },
    sources_used: {
      lurvox_payments: lurvox.ok,
      meta: Boolean(meta?.configured),
      shopify: loadShopify && isShopifyConfigured(),
      shopify_loaded: loadShopify,
      funnels: funnels.length,
      creatives: creatives.length,
      requested_sources: sources,
      meta_sync_investigated: Boolean(meta_sync_investigation),
    },
  }
}
