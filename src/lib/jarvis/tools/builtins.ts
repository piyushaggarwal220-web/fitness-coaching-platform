import { z } from 'zod'
import { registerTool } from '@/lib/jarvis/tools/registry'
import { getMarketingOverview } from '@/lib/ai-marketing/overview'
import {
  getFunnelById,
  getPerformanceByFunnel,
  listFunnels,
} from '@/lib/ai-marketing/funnels'
import { syncMetaMarketingData, runDiagnosticMetaSync } from '@/lib/ai-marketing/meta/sync'
import {
  prepareOrCreateMetaTest,
  pushCreativeToMeta,
  executeMetaWrite,
} from '@/lib/ai-marketing/meta/writes'
import { generateCreativeConcepts } from '@/lib/ai-marketing/agents/creative'
import { runPerformanceAnalysis } from '@/lib/ai-marketing/agents/analytics'
import { buildDailyFunnelReport } from '@/lib/ai-marketing/reporting/daily-report'
import { buildBudgetRecommendations } from '@/lib/ai-marketing/budget-recommendations'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'
import { createVideoEditJob } from '@/lib/ai-marketing/workflows/video-jobs'
import { generateInstagramIdeas } from '@/lib/ai-marketing/agents/instagram'
import { analyzeFunnel } from '@/lib/ai-marketing/agents/funnel'
import { searchMemory, remember } from '@/lib/jarvis/memory/business-memory'
import { runObjectiveResearch } from '@/lib/jarvis/research/research-agent'
import { getCostDashboard } from '@/lib/jarvis/cost/usage'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'

export function ensureJarvisToolsRegistered(): void {
  // registerTool is idempotent for phase expansions
  registerTool({
    name: 'analytics.today_overview',
    description:
      'Today/recent Meta ad overview (spend, purchases, CPA, ROAS per funnel — never blend ₹99 and ₹1,699) plus LURVOX paid revenue from public.purchases and separate Shopify store commerce when connected. Do not treat Meta ad spend/purchases or Shopify orders as LURVOX checkout revenue.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { shopifyTodayCommerce } = await import('@/lib/jarvis/shopify/client')
      const { loadLurvoxRevenue } = await import('@/lib/jarvis/metrics/lurvox-revenue')
      const [overview, shopify_today, lurvox_today] = await Promise.all([
        getMarketingOverview(),
        shopifyTodayCommerce(),
        loadLurvoxRevenue({ preset: 'today' }),
      ])
      return {
        ...overview,
        lurvox_today,
        shopify_today,
        business_revenue_source: 'public.purchases',
        shopify_source: 'shopify_admin',
        ads_source: 'meta',
        note:
          lurvox_today.data_status === 'failed' || lurvox_today.data_status === 'unavailable'
            ? 'LURVOX paid revenue is unavailable — not ₹0. Shopify figures are store commerce only. Meta figures are ads only.'
            : 'Business revenue is lurvox_today (public.purchases). shopify_today is Shopify store commerce only. Meta figures are ad spend/purchases, not cash revenue. Never blend ₹99 and ₹1,699.',
      }
    },
  })

  registerTool({
    name: 'funnels.list',
    description: 'List marketing funnels with economics (target CPA, max CPA, target ROAS). Never blend ₹99 and ₹1,699.',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => listFunnels(),
  })

  registerTool({
    name: 'funnels.performance',
    description: 'Per-funnel performance metrics for a date window. Uses DB funnel economics.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ days: z.number().int().min(1).max(90).optional() }),
    execute: async (input) => getPerformanceByFunnel({ days: input.days ?? 7 }),
  })

  registerTool({
    name: 'funnels.get',
    description: 'Get one funnel by id including economics thresholds.',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ funnelId: z.string().uuid() }),
    execute: async (input) => {
      const f = await getFunnelById(input.funnelId)
      if (!f) throw new Error('Funnel not found')
      return f
    },
  })

  registerTool({
    name: 'funnels.analyze_site',
    description: 'Analyze site funnel conversion diagnosis (existing funnel agent).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.15,
    timeoutMs: 120000,
    tokenBudget: 8000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async (_i, ctx) => analyzeFunnel({ actorId: ctx.actorId }),
  })

  registerTool({
    name: 'meta.status',
    description: 'Meta Marketing API integration status and missing credentials.',
    riskClass: 'READ',
    estimatedCostUsd: 0.001,
    timeoutMs: 5000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { loadMetaIntegrationStatus } = await import(
        '@/lib/jarvis/diagnostics/meta-sync-pipeline'
      )
      const status = await loadMetaIntegrationStatus()
      return {
        ...status,
        liveMetaExecutionEnabled: status.liveMetaExecutionEnabled,
        autonomyLevel: await getAutonomyLevel(),
      }
    },
  })

  registerTool({
    name: 'meta.sync',
    description:
      'Sync campaigns/adsets/ads/creatives/insights from Meta into DB (read-only to Meta). Use mode=diagnostic for a bounded stage-traced minimal sync to locate hangs. Does not enable live Meta execution or change campaigns/budgets.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 180000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z
      .object({
        mode: z.enum(['full', 'diagnostic']).optional().default('full'),
        datePreset: z.string().optional(),
      })
      .optional()
      .default({ mode: 'full' }),
    execute: async (input, ctx) => {
      if (input.mode === 'diagnostic') {
        return runDiagnosticMetaSync({ actorId: ctx.actorId })
      }
      return syncMetaMarketingData({
        actorId: ctx.actorId,
        datePreset: input.datePreset,
        mode: 'full',
      })
    },
  })

  registerTool({
    name: 'meta.pause_ad',
    description: 'Pause a Meta ad by meta ad id. Requires approval. LIVE flag still gates ACTIVE resume/budget.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      targetMetaId: z.string().min(3),
      reason: z.string().optional(),
    }),
    execute: async (input) =>
      executeMetaWrite({
        action: 'PAUSE_AD',
        targetMetaId: input.targetMetaId,
        idempotencyKey: `jarvis:pause:${input.targetMetaId}`,
      }),
  })

  registerTool({
    name: 'meta.increase_budget',
    description: 'Increase Meta entity daily budget. SIGNIFICANT — approval required. ACTIVE spend needs LIVE_META_EXECUTION_ENABLED.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      targetMetaId: z.string().min(3),
      proposed_budget: z.number().positive(),
      current_budget: z.number().optional(),
      reason: z.string().optional(),
    }),
    execute: async (input) =>
      executeMetaWrite({
        action: 'INCREASE_BUDGET',
        targetMetaId: input.targetMetaId,
        parameters: { proposed_budget: input.proposed_budget },
        idempotencyKey: `jarvis:budget_up:${input.targetMetaId}:${input.proposed_budget}`,
      }),
  })

  registerTool({
    name: 'meta.decrease_budget',
    description: 'Decrease Meta entity daily budget. SIGNIFICANT — approval required.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      targetMetaId: z.string().min(3),
      proposed_budget: z.number().positive(),
      current_budget: z.number().optional(),
      reason: z.string().optional(),
    }),
    execute: async (input) =>
      executeMetaWrite({
        action: 'DECREASE_BUDGET',
        targetMetaId: input.targetMetaId,
        parameters: { proposed_budget: input.proposed_budget },
        idempotencyKey: `jarvis:budget_down:${input.targetMetaId}:${input.proposed_budget}`,
      }),
  })

  registerTool({
    name: 'meta.push_creative',
    description: 'Push an approved local creative to Meta as ad creative (PAUSED usage). Idempotent.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.05,
    timeoutMs: 120000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({ creativeId: z.string().uuid() }),
    execute: async (input, ctx) => {
      if (!ctx.actorId) throw new Error('actor required')
      return pushCreativeToMeta({ creativeId: input.creativeId, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'meta.create_test',
    description: 'Create PAUSED Meta test campaign/adset/ads for a funnel. Preview via execute:false path is LOW; execute is SIGNIFICANT.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.08,
    timeoutMs: 180000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      funnelId: z.string().uuid(),
      name: z.string().min(3),
      dailyBudgetInr: z.number().positive(),
      testDays: z.number().int().min(1).max(14).default(3),
      creativeIds: z.array(z.string().uuid()).min(1),
      objective: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      if (!ctx.actorId) throw new Error('actor required')
      return prepareOrCreateMetaTest({
        ...input,
        actorId: ctx.actorId,
        execute: true,
      })
    },
  })

  registerTool({
    name: 'analytics.performance_analysis',
    description: 'Run per-funnel AI performance analysis and queue decisions for approval.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.25,
    timeoutMs: 180000,
    tokenBudget: 12000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async (_i, ctx) => runPerformanceAnalysis({ actorId: ctx.actorId }),
  })

  registerTool({
    name: 'analytics.daily_report',
    description: 'Build multi-funnel daily report with diagnosis.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.2,
    timeoutMs: 180000,
    tokenBudget: 10000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ days: z.number().int().min(1).max(30).optional() }),
    execute: async (input, ctx) =>
      buildDailyFunnelReport({ actorId: ctx.actorId, days: input.days ?? 7 }),
  })

  registerTool({
    name: 'analytics.budget_recommendations',
    description: 'Recommend per-funnel budget changes (human approval; no auto money move).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.05,
    timeoutMs: 60000,
    tokenBudget: 2000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ days: z.number().int().optional() }),
    execute: async (input, ctx) =>
      buildBudgetRecommendations({ actorId: ctx.actorId, days: input.days ?? 14 }),
  })

  registerTool({
    name: 'creatives.performance',
    description: 'Classify creative performance per funnel (WINNER/LOSER/FATIGUED/…).',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      funnelId: z.string().uuid().optional(),
      days: z.number().int().optional(),
    }),
    execute: async (input) =>
      listCreativePerformance({ funnelId: input.funnelId, days: input.days ?? 30 }),
  })

  registerTool({
    name: 'creatives.generate_static',
    description: 'Generate static ad concepts + images for a selected funnel (5/10/20).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.4,
    timeoutMs: 300000,
    tokenBudget: 16000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      funnelId: z.string().uuid(),
      count: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(50)]).default(5),
      generateImages: z.boolean().optional(),
    }),
    execute: async (input, ctx) =>
      generateCreativeConcepts({
        funnelId: input.funnelId,
        count: input.count,
        generateImages: input.generateImages !== false,
        actorId: ctx.actorId,
      }),
  })

  registerTool({
    name: 'video.create_edit_job',
    description:
      'Queue a gym video edit job. Fails clearly if VIDEO_EDIT_PROVIDER is not configured — never fakes a successful render.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.05,
    timeoutMs: 120000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      sourceVideo: z.string().min(3),
      instructions: z.record(z.string(), z.unknown()).optional(),
      funnelId: z.string().uuid().optional(),
    }),
    execute: async (input, ctx) =>
      createVideoEditJob({
        sourceVideo: input.sourceVideo,
        instructions: input.instructions,
        funnelId: input.funnelId,
        actorId: ctx.actorId,
        requireApprovalBeforePublish: true,
      }),
  })

  registerTool({
    name: 'video.list_jobs',
    description: 'List recent video edit jobs and statuses.',
    riskClass: 'READ',
    estimatedCostUsd: 0.001,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    execute: async (input) => {
      const { listRecentVideoJobs } = await import('@/lib/ai-marketing/workflows/video-jobs')
      return listRecentVideoJobs(input.limit ?? 20)
    },
  })

  registerTool({
    name: 'video.find_sources',
    description: 'Find recent source videos / jobs matching a hint (e.g. gym footage).',
    riskClass: 'READ',
    estimatedCostUsd: 0.001,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ hint: z.string().optional() }),
    execute: async (input) => {
      const { findRecentSourceVideos } = await import('@/lib/ai-marketing/workflows/video-jobs')
      return findRecentSourceVideos(input.hint)
    },
  })

  registerTool({
    name: 'video.provider_status',
    description: 'Whether a real video edit provider is configured.',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    timeoutMs: 2000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { getVideoEditProvider, isVideoProviderConfigured } = await import(
        '@/lib/ai-marketing/workflows/video-jobs'
      )
      const p = getVideoEditProvider()
      return {
        configured: isVideoProviderConfigured(),
        provider: p.name,
        note: p.configured
          ? 'Provider ready'
          : 'Video editing provider is not configured.',
      }
    },
  })

  registerTool({
    name: 'instagram.generate_ideas',
    description: 'Generate Instagram content ideas (existing Instagram agent).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.15,
    timeoutMs: 120000,
    tokenBudget: 8000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      count: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(5),
    }),
    execute: async (input, ctx) =>
      generateInstagramIdeas({ count: input.count, actorId: ctx.actorId }),
  })

  registerTool({
    name: 'research.objective',
    description:
      'Objective-driven Brave web research with hard cost/search/source/runtime caps. Reuses recent research memory. Requires decision context.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.35,
    timeoutMs: 180000,
    tokenBudget: 20000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      objective: z.string().min(10),
      decisionContext: z.string().min(10),
      question: z.string().min(5),
      maxSearches: z.number().int().min(1).max(10).optional(),
      maxBudgetUsd: z.number().positive().max(2).optional(),
      maxSources: z.number().int().min(1).max(12).optional(),
      maxRuntimeMinutes: z.number().int().min(1).max(30).optional(),
      maxTokens: z.number().int().optional(),
      forceRefresh: z.boolean().optional(),
    }),
    execute: async (input, ctx) =>
      runObjectiveResearch({
        ...input,
        maxCostUsd: input.maxBudgetUsd,
        actorId: ctx.actorId,
        taskId: ctx.taskId,
      }),
  })

  registerTool({
    name: 'analytics.investigate',
    description:
      'Cross-system investigation (LURVOX paid revenue from public.purchases + Meta ads + Shopify store if configured). Business revenue is LURVOX payments, not Shopify and not Meta. Does not invent causality.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.2,
    timeoutMs: 120000,
    tokenBudget: 8000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      question: z.string().min(5),
      days: z.number().int().min(1).max(30).optional(),
    }),
    execute: async (input, ctx) => {
      const { investigateBusinessQuestion } = await import('@/lib/jarvis/core/investigate')
      return investigateBusinessQuestion({
        question: input.question,
        days: input.days,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'lurvox.revenue',
    description:
      'LURVOX paid revenue from public.purchases (Razorpay captured amount_paise, Asia/Kolkata). Supports today, yesterday, last N days, and from/to YYYY-MM-DD. Not Shopify. Not Meta. Redeemed ₹0 codes are not cash. Query failure is not ₹0.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      preset: z.enum(['today', 'yesterday', 'last_n_days', 'range']).optional(),
      days: z.number().int().min(1).max(90).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
    execute: async (input) => {
      const { loadLurvoxRevenue } = await import('@/lib/jarvis/metrics/lurvox-revenue')
      return loadLurvoxRevenue(input)
    },
  })

  registerTool({
    name: 'shopify.status',
    description: 'Shopify Admin API configuration status (no secrets returned).',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    timeoutMs: 3000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { getShopifyCredentials, isShopifyConfigured } = await import(
        '@/lib/jarvis/shopify/client'
      )
      const creds = getShopifyCredentials()
      return {
        configured: isShopifyConfigured(),
        missing: creds.ok ? [] : creds.missing,
        shop: creds.ok ? creds.shopDomain : null,
        api_version: creds.ok ? creds.apiVersion : null,
        auth: 'client_credentials',
      }
    },
  })

  registerTool({
    name: 'shopify.list_products',
    description: 'List Shopify products (price/inventory summary).',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    execute: async (input) => {
      const { shopifyGetProducts } = await import('@/lib/jarvis/shopify/client')
      return shopifyGetProducts(input.limit ?? 25)
    },
  })

  registerTool({
    name: 'shopify.get_product',
    description: 'Get one Shopify product by id.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ productId: z.union([z.string(), z.number()]) }),
    execute: async (input) => {
      const { shopifyGetProduct } = await import('@/lib/jarvis/shopify/client')
      return shopifyGetProduct(input.productId)
    },
  })

  registerTool({
    name: 'shopify.list_orders',
    description: 'List recent Shopify orders.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      limit: z.number().int().optional(),
      status: z.string().optional(),
    }),
    execute: async (input) => {
      const { shopifyGetOrders } = await import('@/lib/jarvis/shopify/client')
      return shopifyGetOrders(input)
    },
  })

  registerTool({
    name: 'shopify.order_stats',
    description: 'Shopify order count/revenue summary for recent days.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ days: z.number().int().optional() }),
    execute: async (input) => {
      const { shopifyOrderStats } = await import('@/lib/jarvis/shopify/client')
      return shopifyOrderStats(input.days ?? 7)
    },
  })

  registerTool({
    name: 'shopify.today_revenue',
    description:
      "Today's Shopify store revenue, orders, AOV, and refunds. This is Shopify Admin commerce only — not LURVOX checkout revenue. For LURVOX paid revenue use lurvox.revenue. Never infer this from Meta ad spend.",
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { shopifyTodayCommerce } = await import('@/lib/jarvis/shopify/client')
      return shopifyTodayCommerce()
    },
  })

  registerTool({
    name: 'shopify.update_description',
    description: 'Update Shopify product body_html (LOW_RISK).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({
      productId: z.union([z.string(), z.number()]),
      bodyHtml: z.string().min(1),
    }),
    execute: async (input) => {
      const { shopifyUpdateProductDescription } = await import('@/lib/jarvis/shopify/client')
      return shopifyUpdateProductDescription(input.productId, input.bodyHtml)
    },
  })

  registerTool({
    name: 'shopify.update_seo',
    description: 'Update Shopify product SEO title/description (LOW_RISK).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({
      productId: z.union([z.string(), z.number()]),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
    execute: async (input) => {
      const { shopifyUpdateProductSeo } = await import('@/lib/jarvis/shopify/client')
      return shopifyUpdateProductSeo(input.productId, {
        title: input.title,
        description: input.description,
      })
    },
  })

  registerTool({
    name: 'shopify.update_price',
    description: 'Update Shopify variant price — SIGNIFICANT, requires approval.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      productId: z.union([z.string(), z.number()]),
      variantId: z.union([z.string(), z.number()]),
      price: z.string().min(1),
      reason: z.string().optional(),
    }),
    execute: async (input) => {
      const { shopifyUpdateProductPrice } = await import('@/lib/jarvis/shopify/client')
      return shopifyUpdateProductPrice(input.productId, input.variantId, input.price)
    },
  })

  registerTool({
    name: 'shopify.update_status',
    description: 'Update Shopify product status (active/draft/archived) — SIGNIFICANT.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      productId: z.union([z.string(), z.number()]),
      status: z.enum(['active', 'draft', 'archived']),
    }),
    execute: async (input) => {
      const { shopifyUpdateProductStatus } = await import('@/lib/jarvis/shopify/client')
      return shopifyUpdateProductStatus(input.productId, input.status)
    },
  })

  registerTool({
    name: 'shopify.update_image',
    description: 'Add Shopify product image by URL — SIGNIFICANT, requires approval.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      productId: z.union([z.string(), z.number()]),
      imageSrc: z.string().url(),
    }),
    execute: async (input) => {
      const { shopifyUpdateProductImage } = await import('@/lib/jarvis/shopify/client')
      return shopifyUpdateProductImage(input.productId, input.imageSrc)
    },
  })

  registerTool({
    name: 'shopify.change_payment_settings',
    description: 'BLOCKED — payment/billing settings cannot be changed via Jarvis.',
    riskClass: 'DANGEROUS',
    estimatedCostUsd: 0,
    timeoutMs: 1000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { shopifyBlockedOperation } = await import('@/lib/jarvis/shopify/client')
      return shopifyBlockedOperation('change_payment_settings')
    },
  })

  registerTool({
    name: 'memory.search',
    description: 'Search Jarvis business memory (rules, experiments, creatives, decisions).',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      query: z.string().min(2),
      category: z.string().optional(),
      funnelId: z.string().uuid().optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (input) => searchMemory(input),
  })

  registerTool({
    name: 'memory.remember',
    description: 'Store a concise business memory summary (not raw chain-of-thought).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.005,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      category: z.enum([
        'business_rule',
        'funnel_economics',
        'experiment',
        'creative',
        'audience',
        'research',
        'decision',
        'outcome',
        'preference',
        'insight',
      ]),
      title: z.string().min(3),
      summary: z.string().min(10),
      funnelId: z.string().uuid().optional(),
      confidence: z.enum(['low', 'medium', 'high']).optional(),
      tags: z.array(z.string()).optional(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: async (input, ctx) => remember({ ...input, actorId: ctx.actorId }),
  })

  registerTool({
    name: 'system.cost_status',
    description: 'Show AI spend today vs daily/monthly limits. Jarvis cannot raise these limits.',
    riskClass: 'READ',
    estimatedCostUsd: 0.001,
    timeoutMs: 5000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => ({
      ...(await getCostDashboard()),
      budgets: await getJarvisBudgets(),
    }),
  })

  registerTool({
    name: 'system.pending_approvals',
    description: 'List actions awaiting owner approval.',
    riskClass: 'READ',
    estimatedCostUsd: 0.001,
    timeoutMs: 5000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => listPendingApprovals(30),
  })

  registerTool({
    name: 'system.activity',
    description: 'What Jarvis did recently (tool calls + notifications).',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    execute: async (input) => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      const limit = input.limit ?? 20
      const [{ data: tools }, { data: notes }, { data: jobs }] = await Promise.all([
        admin
          .from('jarvis_tool_calls')
          .select('id, tool_name, permission_result, risk_class, created_at, error')
          .order('created_at', { ascending: false })
          .limit(limit),
        admin
          .from('jarvis_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit),
        admin
          .from('jarvis_background_jobs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10),
      ])
      return { tools: tools ?? [], notifications: notes ?? [], jobs: jobs ?? [] }
    },
  })

  registerTool({
    name: 'system.health',
    description: 'Run Jarvis system health checks (OpenAI, Supabase, Meta, Shopify, workers, schemas). Honest statuses only — missing data is not zero.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { runHealthChecks } = await import('@/lib/jarvis/diagnostics/health-checks')
      const checks = await runHealthChecks()
      return { checks }
    },
  })

  registerTool({
    name: 'system.self_test',
    description:
      'Safe self-test of configured integrations and read tools. Never writes Meta/Shopify production data. Failures are not reported as numeric zero.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    timeoutMs: 45000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { runSelfTest } = await import('@/lib/jarvis/diagnostics/diagnostic-engine')
      return runSelfTest()
    },
  })

  registerTool({
    name: 'system.diagnose',
    description:
      'Investigate a Jarvis/business data problem across the full pipeline (tools, APIs, parsers, aggregation, UI). Investigates instead of guessing. Significant remediations require approval.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    timeoutMs: 45000,
    tokenBudget: 2000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      problem: z.string().min(8),
      persist: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { runDiagnostic, formatDiagnosticReply } = await import(
        '@/lib/jarvis/diagnostics/diagnostic-engine'
      )
      const report = await runDiagnostic({
        problem: input.problem,
        userRequest: input.problem,
        actorId: ctx.actorId,
        conversationId: ctx.conversationId,
        taskId: ctx.taskId,
        persist: input.persist !== false,
      })
      return { report, reply: formatDiagnosticReply(report) }
    },
  })

  registerTool({
    name: 'system.why',
    description:
      'Answer why a number, tool, or decision looks wrong by running a live diagnostic investigation — not by explaining from memory.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    timeoutMs: 45000,
    tokenBudget: 2000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ question: z.string().min(8) }),
    execute: async (input, ctx) => {
      const { runDiagnostic, formatDiagnosticReply } = await import(
        '@/lib/jarvis/diagnostics/diagnostic-engine'
      )
      const report = await runDiagnostic({
        problem: input.question,
        userRequest: input.question,
        actorId: ctx.actorId,
        conversationId: ctx.conversationId,
        taskId: ctx.taskId,
        persist: true,
      })
      return { report, reply: formatDiagnosticReply(report) }
    },
  })

  registerTool({
    name: 'diagnostics.list_incidents',
    description: 'List diagnostic incidents and recent diagnostic runs.',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ status: z.string().optional() }),
    execute: async (input) => {
      const { listIncidents, listDiagnosticRuns } = await import(
        '@/lib/jarvis/diagnostics/diagnostic-memory'
      )
      return {
        incidents: await listIncidents(input.status),
        runs: await listDiagnosticRuns(),
      }
    },
  })

  registerTool({
    name: 'diagnostics.apply_safe_fix',
    description:
      'Apply a non-destructive diagnostic remediation (retry, token refresh, cache invalidate, requeue). Cannot change source, schema, credentials, permissions, Meta campaigns, or Shopify writes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      kind: z.enum([
        'retry_transient',
        'refresh_token',
        'refresh_cached_state',
        'invalidate_cache',
        'requeue_job',
        'rebuild_derived_analytics',
        'retry_research',
      ]),
    }),
    execute: async (input) => {
      const { applySafeRemediation } = await import('@/lib/jarvis/diagnostics/safe-debugger')
      return applySafeRemediation(input.kind)
    },
  })

  registerTool({
    name: 'diagnostics.propose_fix',
    description:
      'Propose a significant diagnostic fix (code/schema/config/campaign/data). Always requires explicit owner approval. Never silently deploys or weakens security.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 15000,
    tokenBudget: 0,
    requiresApproval: true,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({
      incident_id: z.string().optional(),
      title: z.string(),
      description: z.string(),
      files: z.array(z.string()).optional(),
    }),
    execute: async (input) => {
      return {
        applied: false,
        status: 'approved_awaiting_implementation',
        note: 'Approval recorded. Jarvis does not silently patch production source from this process. Implement the approved change, then re-run verification.',
        ...input,
      }
    },
  })
}
