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
import { registerExecutionTools } from '@/lib/jarvis/tools/execution-tools'

export function ensureJarvisToolsRegistered(): void {
  registerExecutionTools()
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
      'Queue a gym video edit job (Short-form Fitness Reel preset). Fails clearly if provider not configured — never fakes a successful render. Publishing remains separate/approval-gated.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.25,
    timeoutMs: 180000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      sourceVideo: z.string().min(3),
      instructions: z.record(z.string(), z.unknown()).optional(),
      funnelId: z.string().uuid().optional(),
      preset: z.string().optional(),
      aspectRatio: z.enum(['9:16', '1:1', '16:9']).optional(),
      durationTargetSec: z.number().min(7).max(60).optional(),
      variants: z
        .array(z.enum(['fast_cuts', 'clean_educational', 'high_retention']))
        .max(3)
        .optional(),
      custom_instructions: z.string().max(2000).optional(),
    }),
    execute: async (input, ctx) =>
      createVideoEditJob({
        sourceVideo: input.sourceVideo,
        instructions: {
          ...(input.instructions ?? {}),
          custom_instructions: input.custom_instructions,
        },
        funnelId: input.funnelId,
        actorId: ctx.actorId,
        requireApprovalBeforePublish: true,
        preset: input.preset,
        aspectRatio: input.aspectRatio,
        durationTargetSec: input.durationTargetSec,
        variants: input.variants,
      }),
  })

  registerTool({
    name: 'video.list_jobs',
    description: 'List recent video edit jobs and statuses (no private source URLs).',
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
    description:
      'Search uploaded video sources by filename, transcript, classification, session. Returns exact timestamps when available. Never fabricates timestamps.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      query: z.string().optional(),
      hint: z.string().optional(),
      sessionId: z.string().uuid().optional(),
      sourceId: z.string().uuid().optional(),
      classification: z.string().optional(),
      hasTranscript: z.boolean().optional(),
      hasAudio: z.boolean().optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (input) => {
      const q = input.query || input.hint
      if (input.sessionId || input.classification || input.hasTranscript || (q && q.length > 1)) {
        const { searchFootage } = await import('@/lib/jarvis/video/intelligence')
        return searchFootage({
          query: q,
          sessionId: input.sessionId,
          sourceId: input.sourceId,
          classification: input.classification,
          hasTranscript: input.hasTranscript,
          hasAudio: input.hasAudio,
          limit: input.limit,
        })
      }
      const { findRecentSourceVideos } = await import('@/lib/ai-marketing/workflows/video-jobs')
      return findRecentSourceVideos(q)
    },
  })

  registerTool({
    name: 'video.provider_status',
    description:
      'Video edit (Shotstack) + video intelligence provider status. Distinguishes STUB vs TEST vs REAL and unsupported capabilities.',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    timeoutMs: 2000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { describeVideoProviderConfig } = await import(
        '@/lib/ai-marketing/workflows/video-jobs'
      )
      const { describeVideoIntelligenceConfig } = await import('@/lib/jarvis/video/intelligence')
      return {
        edit_provider: describeVideoProviderConfig(),
        intelligence: describeVideoIntelligenceConfig(),
      }
    },
  })

  registerTool({
    name: 'video.analyze',
    description:
      'Run video intelligence pipeline on a source or session (metadata → transcript → segments → classify). Reports UNSUPPORTED stages honestly. Does not render.',
    riskClass: 'READ',
    estimatedCostUsd: 0.15,
    timeoutMs: 180000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      sourceVideo: z.string().min(3).optional(),
      sourceId: z.string().uuid().optional(),
      sessionId: z.string().uuid().optional(),
    }),
    execute: async (input, ctx) => {
      const intel = await import('@/lib/jarvis/video/intelligence')
      if (input.sessionId) {
        return intel.analyzeSession({
          sessionId: input.sessionId,
          actorId: ctx.actorId,
        })
      }
      const id =
        input.sourceId ||
        (input.sourceVideo ? await intel.resolveSourceId(input.sourceVideo) : null)
      if (!id) {
        if (input.sourceVideo) {
          const { analyzeVideoOnly } = await import('@/lib/ai-marketing/workflows/video-jobs')
          return analyzeVideoOnly({ sourceVideo: input.sourceVideo, actorId: ctx.actorId })
        }
        return { ok: false, error: 'sourceId, sourceVideo, or sessionId required' }
      }
      return intel.analyzeSource({
        sourceId: id,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'video.create_session',
    description: 'Create a content session for a batch of uploaded gym footage.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.001,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      title: z.string().min(2),
      description: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { createVideoSession } = await import('@/lib/jarvis/video/intelligence')
      return createVideoSession({
        title: input.title,
        description: input.description,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'video.session_summary',
    description:
      'Summarize a content session: sources, duration, transcripts, segments, takes, opportunities, approximate Reel count.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ sessionId: z.string().uuid() }),
    execute: async (input) => {
      const { sessionSummary } = await import('@/lib/jarvis/video/intelligence')
      const summary = await sessionSummary(input.sessionId)
      if (!summary) return { ok: false, error: 'Session not found' }
      return summary
    },
  })

  registerTool({
    name: 'video.find_opportunities',
    description:
      'List or build content opportunities from analyzed footage. Optional user idea searches footage and reports gaps. Does not render.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      sessionId: z.string().uuid(),
      idea: z.string().optional(),
      rebuild: z.boolean().optional(),
      maxResults: z.number().int().optional(),
    }),
    execute: async (input) => {
      const intel = await import('@/lib/jarvis/video/intelligence')
      if (input.idea) {
        return intel.opportunityFromUserIdea({
          sessionId: input.sessionId,
          idea: input.idea,
          maxResults: input.maxResults,
        })
      }
      if (input.rebuild) {
        const opportunities = await intel.buildOpportunitiesForSession(input.sessionId)
        const estimate = await intel.estimateReelCount(input.sessionId)
        return { opportunities, estimate }
      }
      const opportunities = await intel.listOpportunities(input.sessionId, input.maxResults ?? 20)
      const estimate = await intel.estimateReelCount(input.sessionId)
      return { opportunities, estimate }
    },
  })

  registerTool({
    name: 'creative.plan',
    description:
      'Creative Director: turn a Phase 4 footage session into structured creative plans (hook/structure/CTA/source map). Never publishes or renders.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.05,
    timeoutMs: 120000,
    tokenBudget: 2000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      session_id: z.string().uuid(),
      idea: z.string().optional(),
      objective: z.string().optional(),
      audience: z.string().optional(),
      platform: z.string().optional(),
      format: z.string().optional(),
      duration_sec: z.number().optional(),
      count: z.number().int().min(1).max(10).optional(),
      funnel_id: z.string().uuid().optional(),
      tone: z.string().optional(),
      cta: z.string().optional(),
      pillars: z.array(z.string()).optional(),
      current_instruction: z.string().optional(),
      force_new_variants: z.boolean().optional(),
      save: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { planFromSession } = await import('@/lib/jarvis/creative')
      return planFromSession({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'creative.generate_draft',
    description:
      'Creative Director: user idea → footage search → concept/script/source map. Distinguishes spoken footage vs overlays vs new recording. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.05,
    timeoutMs: 120000,
    tokenBudget: 2000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      idea: z.string().min(3),
      session_id: z.string().uuid().optional(),
      objective: z.string().optional(),
      audience: z.string().optional(),
      duration_sec: z.number().optional(),
      funnel_id: z.string().uuid().optional(),
      tone: z.string().optional(),
      cta: z.string().optional(),
      current_instruction: z.string().optional(),
      save: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { planFromIdea } = await import('@/lib/jarvis/creative')
      return planFromIdea({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'creative.plan_batch',
    description:
      'Creative Director: diversified batch of footage-backed creatives (avoid near-duplicates). Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.08,
    timeoutMs: 180000,
    tokenBudget: 3000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      session_id: z.string().uuid(),
      count: z.number().int().min(1).max(10).optional(),
      objective: z.string().optional(),
      audience: z.string().optional(),
      pillars: z.array(z.string()).optional(),
      funnel_id: z.string().uuid().optional(),
      tone: z.string().optional(),
      duration_sec: z.number().optional(),
      force_new_variants: z.boolean().optional(),
      current_instruction: z.string().optional(),
      save: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { planCreativeBatch } = await import('@/lib/jarvis/creative')
      return planCreativeBatch({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'creative.revise',
    description:
      'Revise an existing creative from feedback (hook/CTA/captions/take/etc). Creates a new version; does not overwrite history. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.03,
    timeoutMs: 90000,
    tokenBudget: 1500,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      creative_id: z.string().uuid(),
      feedback: z.string().min(2),
      remember_preference: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { reviseCreative } = await import('@/lib/jarvis/creative')
      const result = await reviseCreative({ ...input, actorId: ctx.actorId })
      try {
        const { parseTasteFeedback, ingestTasteSignals } = await import('@/lib/jarvis/taste')
        const signals = parseTasteFeedback(input.feedback)
        await ingestTasteSignals(signals, {
          creative_content_id: input.creative_id,
          actorId: ctx.actorId,
          feedback_text: input.feedback,
        })
      } catch {
        /* taste optional */
      }
      return result
    },
  })

  registerTool({
    name: 'creative.taste_profile',
    description:
      'Get the creative Taste Profile (active preferences, candidates, conflicts, confirmation asks). USER_TASTE only; audience signals separated.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}),
    execute: async () => {
      const { getTasteProfile } = await import('@/lib/jarvis/taste')
      return getTasteProfile()
    },
  })

  registerTool({
    name: 'creative.taste_preferences',
    description: 'List structured taste preferences filtered by status. Creative production preferences only.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      status: z.array(z.string()).optional(),
      signal_kind: z.enum(['USER_TASTE', 'AUDIENCE_SIGNAL']).optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (input) => {
      const { listTastePreferences } = await import('@/lib/jarvis/taste')
      return {
        preferences: await listTastePreferences({
          status: input.status,
          signal_kind: input.signal_kind,
          limit: input.limit,
        }),
      }
    },
  })

  registerTool({
    name: 'creative.taste_explain',
    description: 'Explain why a taste preference exists, with evidence provenance. Never fabricates reasons.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ preference_id: z.string().uuid() }),
    execute: async (input) => {
      const {
        listTastePreferences,
        listEvidenceForPreference,
        explainPreference,
      } = await import('@/lib/jarvis/taste')
      const prefs = await listTastePreferences({ limit: 100 })
      const pref = prefs.find((p) => p.id === input.preference_id)
      if (!pref) return { ok: false, note: 'Preference not found' }
      const evidence = await listEvidenceForPreference(input.preference_id)
      const explained = explainPreference({ preference: pref, evidence })
      return {
        found: true,
        explanation: explained.explanation,
        evidence_summaries: explained.evidence_summaries,
        evidence_ok: explained.ok,
      }
    },
  })

  registerTool({
    name: 'creative.taste_feedback',
    description:
      'Record explicit creative feedback as taste evidence (deterministic parse). Does not auto-publish. Current-turn revision-only phrases are not durable prefs.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      feedback: z.string().min(2).max(2000),
      creative_id: z.string().uuid().optional(),
      edl_id: z.string().uuid().optional(),
      scope: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { parseTasteFeedback, ingestTasteSignals } = await import('@/lib/jarvis/taste')
      const signals = parseTasteFeedback(input.feedback, {
        scope: input.scope as import('@/lib/jarvis/taste').TasteScope | undefined,
      })
      const results = await ingestTasteSignals(signals, {
        creative_content_id: input.creative_id,
        edl_id: input.edl_id,
        actorId: ctx.actorId,
        feedback_text: input.feedback,
      })
      return { ok: true, signals, results, note: 'No publish. Taste evidence recorded where eligible.' }
    },
  })

  registerTool({
    name: 'creative.taste_confirm',
    description: 'Confirm a candidate taste preference as ACTIVE standing preference. Evidence preserved.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({
      preference_id: z.string().uuid(),
      scope: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { confirmTastePreference } = await import('@/lib/jarvis/taste')
      return confirmTastePreference({
        preference_id: input.preference_id,
        scope: input.scope as import('@/lib/jarvis/taste').TasteScope | undefined,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'creative.taste_reject',
    description:
      'Reject a taste preference (marks REJECTED). Evidence trail is preserved — not deleted.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({ preference_id: z.string().uuid() }),
    execute: async (input, ctx) => {
      const { rejectTastePreference } = await import('@/lib/jarvis/taste')
      return rejectTastePreference({
        preference_id: input.preference_id,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'creative.list',
    description: 'List Creative Director plans (drafts/review/ready_for_edit). Not a publish action.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      session_id: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (input) => {
      const { listCreativePlans } = await import('@/lib/jarvis/creative')
      const plans = await listCreativePlans({
        sessionId: input.session_id,
        status: input.status,
        limit: input.limit,
      })
      return { plans, note: 'Creative plans only — publishing requires separate approval tools.' }
    },
  })

  registerTool({
    name: 'creative.schedule',
    description:
      'Schedule a creative idea on the calendar (planned date). Does NOT publish to Instagram.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      content_id: z.string().uuid(),
      planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      pillar: z.string().optional(),
      objective: z.string().optional(),
      format: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { scheduleCreative, loadCreativeById } = await import('@/lib/jarvis/creative')
      const existing = await loadCreativeById(input.content_id)
      const row = await scheduleCreative({
        contentId: input.content_id,
        plannedDate: input.planned_date,
        pillar: input.pillar || existing?.plan?.pillar,
        objective: input.objective || existing?.plan?.objective,
        format: input.format || existing?.plan?.format,
        actorId: ctx.actorId,
      })
      return {
        ok: true,
        calendar_id: row.id,
        note: 'Scheduled on creative calendar only. Not published.',
      }
    },
  })

  registerTool({
    name: 'video.create_edl',
    description:
      'Phase 6: Create a durable Edit Decision List from a Phase 5 creative plan. Never invents timestamps. Never renders. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      creative_id: z.string().uuid(),
      force_new: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { createAndPersistEdl } = await import('@/lib/jarvis/video/editor')
      return createAndPersistEdl({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'video.get_edl',
    description: 'Load a durable EDL by id.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ edl_id: z.string().uuid() }),
    execute: async (input) => {
      const { loadEdl } = await import('@/lib/jarvis/video/editor')
      const row = await loadEdl(input.edl_id)
      if (!row) return { ok: false, error: 'EDL_NOT_FOUND' }
      return { ok: true, ...row }
    },
  })

  registerTool({
    name: 'video.validate_edl',
    description: 'Validate an EDL before render. Reports MISSING_FOOTAGE / unsupported ops honestly.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ edl_id: z.string().uuid() }),
    execute: async (input) => {
      const { loadEdl, validateEdl } = await import('@/lib/jarvis/video/editor')
      const row = await loadEdl(input.edl_id)
      if (!row) return { ok: false, error: 'EDL_NOT_FOUND' }
      return { ok: true, validation: validateEdl(row.edl), edl_id: row.id }
    },
  })

  registerTool({
    name: 'video.render_edl',
    description:
      'Validate EDL, check cost governor, translate to Shotstack, submit render. Never publishes to Instagram.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.35,
    timeoutMs: 120000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ edl_id: z.string().uuid() }),
    execute: async (input, ctx) => {
      const { renderEdl } = await import('@/lib/jarvis/video/editor')
      return renderEdl({ edl_id: input.edl_id, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'video.revise_edl',
    description:
      'Targeted EDL revision from feedback (keep everything else). Creates new version. Does not auto-render.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      edl_id: z.string().uuid(),
      feedback: z.string().min(2),
    }),
    execute: async (input, ctx) => {
      const { reviseEdl } = await import('@/lib/jarvis/video/editor')
      return reviseEdl({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'video.compare_edl_versions',
    description: 'Structured EDL diff between two versions (or parent → child).',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      from_edl_id: z.string().uuid(),
      to_edl_id: z.string().uuid(),
    }),
    execute: async (input) => {
      const { loadEdl, diffEdls } = await import('@/lib/jarvis/video/editor')
      const a = await loadEdl(input.from_edl_id)
      const b = await loadEdl(input.to_edl_id)
      if (!a || !b) return { ok: false, error: 'EDL_NOT_FOUND' }
      return { ok: true, diff: diffEdls(a.edl, b.edl) }
    },
  })

  registerTool({
    name: 'video.get_render',
    description: 'Get a video_edit_jobs render row (with EDL provenance when present).',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ job_id: z.string().uuid() }),
    execute: async (input) => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      const { data } = await admin
        .from('video_edit_jobs')
        .select(
          'id, status, provider, provider_job_id, edl_id, edl_version, output_video, error, estimated_cost_usd, actual_cost_usd, approval_status, metadata, created_at'
        )
        .eq('id', input.job_id)
        .maybeSingle()
      if (!data) return { ok: false, error: 'JOB_NOT_FOUND' }
      return {
        ok: true,
        job: data,
        note: 'output_video may be private archival ref — never auto-publish',
      }
    },
  })

  registerTool({
    name: 'video.list_renders',
    description: 'List recent renders, optionally filtered by EDL.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      edl_id: z.string().uuid().optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (input) => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      let q = admin
        .from('video_edit_jobs')
        .select(
          'id, status, provider, provider_job_id, edl_id, edl_version, estimated_cost_usd, approval_status, created_at, output_video'
        )
        .order('created_at', { ascending: false })
        .limit(input.limit ?? 20)
      if (input.edl_id) q = q.eq('edl_id', input.edl_id)
      const { data } = await q
      return {
        jobs: (data ?? []).map((j) => ({
          id: j.id,
          status: j.status,
          provider: j.provider,
          provider_job_id: j.provider_job_id,
          edl_id: j.edl_id,
          edl_version: j.edl_version,
          estimated_cost_usd: j.estimated_cost_usd,
          approval_status: j.approval_status,
          created_at: j.created_at,
          has_output: Boolean(j.output_video),
        })),
        note: 'Not published.',
      }
    },
  })

  registerTool({
    name: 'video.approve_render',
    description:
      'Mark a rendered video as APPROVED for review workflow. Does NOT publish to Instagram.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ job_id: z.string().uuid() }),
    execute: async (input) => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      const { data: job } = await admin
        .from('video_edit_jobs')
        .update({ approval_status: 'approved' })
        .eq('id', input.job_id)
        .select('id, edl_id')
        .maybeSingle()
      if (job?.edl_id) {
        const { updateEdlStatus } = await import('@/lib/jarvis/video/editor')
        await updateEdlStatus(job.edl_id, 'APPROVED')
        try {
          const { learnFromRenderDecision } = await import('@/lib/jarvis/taste')
          await learnFromRenderDecision({
            kind: 'approved',
            job_id: input.job_id,
            edl_id: job.edl_id,
          })
        } catch {
          /* taste optional */
        }
      }
      return { ok: true, note: 'Render approved locally. Still NOT published to Instagram.' }
    },
  })

  registerTool({
    name: 'video.reject_render',
    description: 'Reject a render (keeps creative/EDL history). Does not publish.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      job_id: z.string().uuid(),
      reason: z.string().optional(),
    }),
    execute: async (input) => {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      const { data: job } = await admin
        .from('video_edit_jobs')
        .update({
          approval_status: 'rejected',
          error: input.reason || 'rejected by operator',
        })
        .eq('id', input.job_id)
        .select('id, edl_id')
        .maybeSingle()
      if (job?.edl_id) {
        const { updateEdlStatus, appendEdlFeedback } = await import('@/lib/jarvis/video/editor')
        await updateEdlStatus(job.edl_id, 'REJECTED')
        if (input.reason) await appendEdlFeedback(job.edl_id, { feedback: input.reason, kind: 'reject' })
        try {
          const { learnFromRenderDecision } = await import('@/lib/jarvis/taste')
          await learnFromRenderDecision({
            kind: 'rejected',
            job_id: input.job_id,
            edl_id: job.edl_id,
            reason: input.reason,
          })
        } catch {
          /* taste optional */
        }
      }
      return { ok: true, note: 'Render rejected. Not published.' }
    },
  })

  registerTool({
    name: 'video.render',
    description:
      'Create and run an edit/render job for a source (alias of create_edit_job with Fitness Reel preset). Never claims publish.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.25,
    timeoutMs: 180000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      sourceVideo: z.string().min(3),
      durationTargetSec: z.number().min(7).max(60).optional(),
      custom_instructions: z.string().max(2000).optional(),
      variants: z
        .array(z.enum(['fast_cuts', 'clean_educational', 'high_retention']))
        .max(3)
        .optional(),
    }),
    execute: async (input, ctx) =>
      createVideoEditJob({
        sourceVideo: input.sourceVideo,
        instructions: { custom_instructions: input.custom_instructions },
        actorId: ctx.actorId,
        requireApprovalBeforePublish: true,
        durationTargetSec: input.durationTargetSec,
        variants: input.variants,
      }),
  })

  registerTool({
    name: 'video.cancel',
    description: 'Cancel a queued/in-progress video edit job.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ jobId: z.string().uuid() }),
    execute: async (input, ctx) => {
      const { cancelVideoJob } = await import('@/lib/ai-marketing/workflows/video-jobs')
      return cancelVideoJob({ jobId: input.jobId, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.status',
    description:
      'Instagram Graph configuration status (no secrets). Reports whether reads/publishing gates are available.',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    timeoutMs: 3000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { instagramStatus } = await import('@/lib/jarvis/instagram')
      return instagramStatus()
    },
  })

  registerTool({
    name: 'instagram.get_profile',
    description:
      'Read Instagram business profile (followers/media counts). Failures are unavailable/failed — never zero.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async (_input, ctx) => {
      const { getInstagramProfile } = await import('@/lib/jarvis/instagram')
      return getInstagramProfile({ actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.list_media',
    description: 'List recent Instagram media via Graph API (when configured).',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    execute: async (input, ctx) => {
      const { listInstagramMedia } = await import('@/lib/jarvis/instagram')
      return listInstagramMedia({ limit: input.limit }, { actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.get_media',
    description: 'Get Instagram media metadata by id.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ mediaId: z.string().min(1) }),
    execute: async (input, ctx) => {
      const { getInstagramMedia } = await import('@/lib/jarvis/instagram')
      return getInstagramMedia(input.mediaId, { actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.media_insights',
    description:
      'Fetch available Instagram media insights. Missing metrics stay null — never coerced to zero.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      mediaId: z.string().min(1),
      metrics: z.array(z.string()).optional(),
    }),
    execute: async (input, ctx) => {
      const { getInstagramMediaInsights } = await import('@/lib/jarvis/instagram')
      return getInstagramMediaInsights(input.mediaId, input.metrics, { actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.content_performance',
    description:
      'Local Instagram performance from marketing_content (views/reach/likes when present). Null ≠ 0.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    execute: async (input) => {
      const { localContentPerformance } = await import('@/lib/jarvis/instagram')
      return localContentPerformance(input.limit ?? 30)
    },
  })

  registerTool({
    name: 'instagram.posting_frequency',
    description: 'Posting frequency from local marketing_content posted_at timestamps.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    execute: async (input) => {
      const { localPostingFrequency } = await import('@/lib/jarvis/instagram')
      return localPostingFrequency(input.limit ?? 50)
    },
  })

  registerTool({
    name: 'instagram.engagement_summary',
    description: 'Engagement summary from verified local metrics only.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    execute: async (input) => {
      const { localEngagementSummary } = await import('@/lib/jarvis/instagram')
      return localEngagementSummary(input.limit ?? 40)
    },
  })

  registerTool({
    name: 'instagram.sync_content',
    description:
      'READ-ONLY bounded sync of Instagram profile/media/insights into historical snapshots. Idempotent per IST day. Never publishes.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    timeoutMs: 120000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      mediaLimit: z.number().int().min(1).max(25).optional(),
    }),
    execute: async (input, ctx) => {
      const { syncInstagramContent } = await import('@/lib/jarvis/instagram')
      return syncInstagramContent({
        mediaLimit: input.mediaLimit,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'instagram.analyze_performance',
    description:
      'Analyze stored Instagram historical snapshots (reach/views/interactions by format/time). Does not invent topics or claim winning formats without sample size.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      days: z.number().int().min(1).max(90).optional(),
      writeMemory: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { analyzeInstagramPerformance } = await import('@/lib/jarvis/instagram')
      return analyzeInstagramPerformance({
        days: input.days,
        writeMemory: input.writeMemory,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'instagram.analyze_content',
    description:
      'Analyze recent Instagram content (strongest/weakest by verified metrics, formats, topics). No false causation.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.05,
    timeoutMs: 60000,
    tokenBudget: 2000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      limit: z.number().int().optional(),
      includeLiveMedia: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { analyzeInstagramContent } = await import('@/lib/jarvis/instagram')
      return analyzeInstagramContent({
        limit: input.limit,
        includeLiveMedia: input.includeLiveMedia,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'instagram.research_trends',
    description:
      'Research fitness/Reels/topic trends via existing research.objective + Brave. Separates facts/inference/recommendations.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.35,
    timeoutMs: 180000,
    tokenBudget: 20000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      focus: z
        .enum([
          'fitness_content_trends',
          'reels_trends',
          'topic_opportunities',
          'audience_patterns',
          'public_competitor_observations',
        ])
        .optional(),
      question: z.string().min(5).optional(),
      decisionContext: z.string().min(10).optional(),
      maxBudgetUsd: z.number().positive().max(2).optional(),
    }),
    execute: async (input, ctx) => {
      const { researchInstagramTrends } = await import('@/lib/jarvis/instagram')
      return researchInstagramTrends({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.plan_content',
    description:
      'Evidence-backed Instagram content planner. Separates FIRST_PARTY / EXTERNAL_RESEARCH / BUSINESS_CONTEXT. Max 10 ideas. Dedupes recent hooks/topics. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.2,
    timeoutMs: 180000,
    tokenBudget: 8000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      count: z.number().int().min(1).max(10).optional(),
      number_of_ideas: z.number().int().min(1).max(10).optional(),
      objective: z.string().max(200).optional(),
      topicHint: z.string().optional(),
      content_type: z.enum(['reel', 'carousel', 'story', 'post']).optional(),
      audience: z.string().max(200).optional(),
      funnel_id: z.string().uuid().optional(),
      research: z.boolean().optional(),
      researchSummary: z.string().optional(),
      sourcedFacts: z.array(z.string()).optional(),
      date_range_days: z.number().int().min(1).max(90).optional(),
      save: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { planInstagramContent } = await import('@/lib/jarvis/instagram')
      return planInstagramContent({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.generate_ideas',
    description:
      'Alias for evidence-backed Instagram ideas via plan_content (preferred). Legacy agent path when count is 20.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.2,
    timeoutMs: 180000,
    tokenBudget: 8000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      count: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(5),
      topicHint: z.string().optional(),
      research: z.boolean().optional(),
      objective: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      if (input.count === 20) {
        return generateInstagramIdeas({
          count: input.count,
          topicHint: input.topicHint,
          actorId: ctx.actorId,
        })
      }
      const { planInstagramContent } = await import('@/lib/jarvis/instagram')
      return planInstagramContent({
        number_of_ideas: input.count,
        topicHint: input.topicHint,
        objective: input.objective,
        research: input.research,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'instagram.generate_draft',
    description:
      'Generate a complete video draft/script/shot list from a content idea. Saves as draft. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.18,
    timeoutMs: 120000,
    tokenBudget: 6000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      content_id: z.string().uuid().optional(),
      idea: z
        .object({
          topic: z.string().optional(),
          hook: z.string().optional(),
          format: z.enum(['reel', 'carousel', 'story', 'post']).optional(),
          reel_concept: z.string().optional(),
          caption: z.string().optional(),
          cta: z.string().optional(),
          target_audience: z.string().optional(),
          objective: z.string().optional(),
          concept: z.string().optional(),
          caption_angle: z.string().optional(),
          visual_structure: z.string().optional(),
          estimated_duration_sec: z.number().optional(),
          suggested_aspect_ratio: z.string().optional(),
        })
        .optional(),
      save: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { generateInstagramDraft } = await import('@/lib/jarvis/instagram')
      return generateInstagramDraft({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.save_draft',
    description: 'Save or update an Instagram content draft in marketing_content.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      contentId: z.string().uuid().optional(),
      topic: z.string().optional(),
      hook: z.string().optional(),
      caption: z.string().optional(),
      cta: z.string().optional(),
      script: z.string().optional(),
      contentType: z.enum(['reel', 'carousel', 'story', 'post', 'idea']).optional(),
    }),
    execute: async (input, ctx) => {
      const { saveInstagramDraft } = await import('@/lib/jarvis/instagram')
      return saveInstagramDraft({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.prepare_publish',
    description:
      'Prepare an Instagram publish draft (caption + completed video asset). Does NOT publish. Actual publish needs approval.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      contentId: z.string().uuid().optional(),
      caption: z.string().min(1),
      mediaUrl: z.string().url().optional(),
      videoJobId: z.string().uuid().optional(),
      mediaType: z.enum(['IMAGE', 'VIDEO', 'REELS']).optional(),
    }),
    execute: async (input, ctx) => {
      const { prepareInstagramPublish } = await import('@/lib/jarvis/instagram')
      return prepareInstagramPublish({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.publish',
    description:
      'Publish prepared Instagram media. SIGNIFICANT — requires human approval. Also gated by LIVE_INSTAGRAM_PUBLISHING_ENABLED. Caption generation alone is not approval.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.05,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      contentId: z.string().uuid().optional(),
      caption: z.string().min(1),
      mediaUrl: z.string().url().optional(),
      videoJobId: z.string().uuid().optional(),
      mediaType: z.enum(['IMAGE', 'VIDEO', 'REELS']).optional(),
    }),
    execute: async (input, ctx) => {
      const { executeInstagramPublish } = await import('@/lib/jarvis/instagram')
      return executeInstagramPublish({
        ...input,
        actorId: ctx.actorId,
        approved: Boolean(ctx.approvedExecution),
      })
    },
  })

  registerTool({
    name: 'instagram.delete_media',
    description: 'Delete Instagram media. SIGNIFICANT — requires approval. Live delete stays gated.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({ mediaId: z.string().min(1) }),
    execute: async (input, ctx) => {
      const { executeInstagramDelete } = await import('@/lib/jarvis/instagram')
      return executeInstagramDelete({
        mediaId: input.mediaId,
        actorId: ctx.actorId,
        approved: Boolean(ctx.approvedExecution),
      })
    },
  })

  registerTool({
    name: 'instagram.modify_settings',
    description: 'BLOCKED — Instagram account settings cannot be changed via Jarvis.',
    riskClass: 'DANGEROUS',
    estimatedCostUsd: 0,
    timeoutMs: 1000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { blockedInstagramAccountSettings } = await import('@/lib/jarvis/instagram')
      return blockedInstagramAccountSettings()
    },
  })

  registerTool({
    name: 'instagram.change_credentials',
    description: 'BLOCKED — Instagram credentials/permissions cannot be changed via Jarvis.',
    riskClass: 'DANGEROUS',
    estimatedCostUsd: 0,
    timeoutMs: 1000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    inputSchema: z.object({}).optional().default({}),
    execute: async () => {
      const { blockedInstagramCredentialChanges } = await import('@/lib/jarvis/instagram')
      return blockedInstagramCredentialChanges()
    },
  })

  // --- Phase 8 niche / content intelligence ---
  registerTool({
    name: 'instagram.find_viral_reels',
    description:
      'Discover publicly discussed fitness Reels via WEB_RESEARCH (Brave). Metrics UNAVAILABLE stay UNAVAILABLE. Third-party Graph UNSUPPORTED. No virality guarantees. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.15,
    timeoutMs: 90000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      query: z.string().optional(),
      niche: z.string().optional(),
      geography: z.enum(['INDIA', 'GLOBAL', 'OTHER_REGION', 'UNKNOWN']).optional(),
      window: z.string().optional(),
      limit: z.number().int().min(1).max(25).optional(),
      maxBudgetUsd: z.number().positive().max(1).optional(),
    }),
    execute: async (input, ctx) => {
      const { findViralReels } = await import('@/lib/jarvis/instagram/niche')
      return findViralReels({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.analyze_creator',
    description:
      'Analyze a public fitness creator via WEB_RESEARCH. Neutral pattern language. No private inference. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.12,
    timeoutMs: 90000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      handle: z.string().min(2),
      sample_size: z.number().int().min(5).max(30).optional(),
      observation_window: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { analyzeCreator } = await import('@/lib/jarvis/instagram/niche')
      return analyzeCreator({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.compare_creators',
    description:
      'Compare multiple public creators (pattern discovery only — not a ranking). Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.35,
    timeoutMs: 180000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      handles: z.array(z.string().min(2)).min(2).max(8),
    }),
    execute: async (input, ctx) => {
      const { analyzeCreator, compareCreators } = await import('@/lib/jarvis/instagram/niche')
      const profiles = []
      for (const handle of input.handles) {
        const r = await analyzeCreator({ handle, actorId: ctx.actorId })
        if (r.profile) profiles.push(r.profile)
      }
      return { ...compareCreators(profiles), profiles_count: profiles.length }
    },
  })

  registerTool({
    name: 'instagram.research_niche_trends',
    description:
      'Bounded niche trend report (hooks/topics/gaps/repetition) with observation window + geography labels. WEB_RESEARCH. No causal virality claims. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.35,
    timeoutMs: 180000,
    tokenBudget: 8000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      niche: z.string().optional(),
      geography: z.enum(['INDIA', 'GLOBAL', 'OTHER_REGION', 'UNKNOWN']).optional(),
      window: z.string().optional(),
      question: z.string().optional(),
      forceRefresh: z.boolean().optional(),
      maxBudgetUsd: z.number().positive().max(1).optional(),
    }),
    execute: async (input, ctx) => {
      const { researchNicheTrends } = await import('@/lib/jarvis/instagram/niche')
      return researchNicheTrends({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.get_trend_report',
    description: 'Get the latest cached Instagram niche trend report.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}),
    execute: async () => {
      const { getLatestTrendReport } = await import('@/lib/jarvis/instagram/niche')
      const report = await getLatestTrendReport()
      return { ok: Boolean(report), report }
    },
  })

  registerTool({
    name: 'instagram.get_creator_report',
    description: 'Analyze or refresh a creator profile report (WEB_RESEARCH).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.12,
    timeoutMs: 90000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ handle: z.string().min(2) }),
    execute: async (input, ctx) => {
      const { analyzeCreator } = await import('@/lib/jarvis/instagram/niche')
      return analyzeCreator({ handle: input.handle, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.find_content_gaps',
    description:
      'Detect CONTENT_GAP_SIGNAL: topics frequent externally but missing on own account. Not a performance prediction. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.25,
    timeoutMs: 120000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      niche: z.string().optional(),
      geography: z.enum(['INDIA', 'GLOBAL', 'OTHER_REGION', 'UNKNOWN']).optional(),
      window: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { researchNicheTrends } = await import('@/lib/jarvis/instagram/niche')
      const r = await researchNicheTrends({
        ...input,
        actorId: ctx.actorId,
        includeOpportunities: false,
      })
      return {
        ok: r.ok,
        gaps: r.report?.content_gaps || [],
        observation_window: r.report?.observation_window,
        geography: r.report?.geography,
        limitations: r.report?.limitations || [],
        note: r.note,
      }
    },
  })

  registerTool({
    name: 'instagram.generate_opportunities',
    description:
      'Combine niche trends + own audience signal + taste + footage + business objective into original content opportunities. Hands off to Creative Director separately. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.4,
    timeoutMs: 180000,
    tokenBudget: 4000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      niche: z.string().optional(),
      geography: z.enum(['INDIA', 'GLOBAL', 'OTHER_REGION', 'UNKNOWN']).optional(),
      window: z.string().optional(),
      business_objective: z.string().optional(),
      session_id: z.string().uuid().optional(),
      forceRefresh: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { generateNicheOpportunities } = await import('@/lib/jarvis/instagram/niche')
      return generateNicheOpportunities({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'instagram.search_content_intelligence',
    description:
      'Search stored viral reel references / opportunities by topic or niche.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      niche: z.string().optional(),
      geography: z.string().optional(),
      limit: z.number().int().optional(),
    }),
    execute: async (input) => {
      const { listViralReels, listOpportunities } = await import('@/lib/jarvis/instagram/niche')
      const reels = await listViralReels({
        niche: input.niche,
        geography: input.geography,
        limit: input.limit,
      })
      const opportunities = await listOpportunities(input.limit ?? 20)
      return { reels, opportunities }
    },
  })

  registerTool({
    name: 'instagram.watchlist',
    description: 'Create or list niche intelligence watchlists (creators/topics/geographies).',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      action: z.enum(['list', 'upsert']).default('list'),
      name: z.string().optional(),
      creators: z.array(z.string()).optional(),
      niches: z.array(z.string()).optional(),
      topics: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
      geographies: z.array(z.string()).optional(),
      id: z.string().uuid().optional(),
      active: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const { listWatchlists, upsertWatchlist } = await import('@/lib/jarvis/instagram/niche')
      if (input.action === 'list') return { watchlists: await listWatchlists() }
      if (!input.name) return { ok: false, note: 'name required for upsert' }
      const row = await upsertWatchlist({
        id: input.id,
        name: input.name,
        creators: input.creators || [],
        niches: input.niches || [],
        topics: input.topics || [],
        keywords: input.keywords || [],
        geographies: input.geographies || [],
        active: input.active ?? true,
        actorId: ctx.actorId,
      })
      return { ok: true, watchlist: row }
    },
  })

  registerTool({
    name: 'instagram.refresh_intelligence',
    description:
      'Bounded refresh of niche intelligence (trends/watchlist). Cost-governed. Never publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.25,
    timeoutMs: 180000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ maxSpendUsd: z.number().positive().max(1).optional() }),
    execute: async (input) => {
      const { runNicheIntelligenceMaintenance } = await import('@/lib/jarvis/instagram/niche')
      return runNicheIntelligenceMaintenance({ maxSpendUsd: input.maxSpendUsd })
    },
  })

  registerTool({
    name: 'instagram.handoff_opportunity',
    description:
      'Hand a niche content opportunity to Creative Director (Phase 5). Does not render or publish.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.2,
    timeoutMs: 180000,
    tokenBudget: 4000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      opportunity_fingerprint: z.string().min(8),
      session_id: z.string().uuid().optional(),
    }),
    execute: async (input, ctx) => {
      const { handoffOpportunityToCreative } = await import('@/lib/jarvis/instagram/niche')
      return handoffOpportunityToCreative({ ...input, actorId: ctx.actorId })
    },
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
    name: 'analytics.business_snapshot',
    description:
      'Unified LURVOX business snapshot: revenue (purchases), funnels, Meta advertising, optional Shopify/Instagram/creatives/video, operations. Unavailable stays explicit — never invents zeros. Shopify ≠ LURVOX cash.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z
      .object({
        include_shopify: z.boolean().optional(),
        include_instagram: z.boolean().optional(),
        include_creatives: z.boolean().optional(),
      })
      .optional()
      .default({}),
    execute: async (input) => {
      const { buildBusinessOperatorSnapshot } = await import('@/lib/jarvis/operator/snapshot')
      return buildBusinessOperatorSnapshot({
        includeShopify: input?.include_shopify ?? true,
        includeInstagram: input?.include_instagram ?? true,
        includeCreatives: input?.include_creatives ?? true,
      })
    },
  })

  registerTool({
    name: 'analytics.investigate',
    description:
      'Bounded cross-system investigation (LURVOX + Meta + optional Shopify/Instagram/memory). Supports named patterns (business_health, sales_drop, funnel_performance, …). Returns OBSERVED / INFERRED / UNCERTAIN / RECOMMENDATION.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.2,
    timeoutMs: 120000,
    tokenBudget: 8000,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      question: z.string().min(5).optional(),
      objective: z.string().min(5).optional(),
      pattern_id: z
        .enum([
          'business_health',
          'sales_drop',
          'sales_growth',
          'ad_performance',
          'funnel_performance',
          'creative_performance',
          'instagram_performance',
          'shopify_performance',
          'budget_efficiency',
          'customer_acquisition',
          'content_opportunity',
          'business_anomaly',
          'daily_report',
          'weekly_report',
        ])
        .optional(),
      days: z.number().int().min(1).max(30).optional(),
      systems_allowed: z
        .array(z.enum(['lurvox', 'meta', 'shopify', 'instagram', 'memory']))
        .optional(),
      max_tool_calls: z.number().int().min(1).max(12).optional(),
      max_runtime_ms: z.number().int().min(5000).max(180000).optional(),
      max_cost_usd: z.number().min(0.01).max(1).optional(),
    }),
    execute: async (input, ctx) => {
      const { runInvestigationPattern } = await import(
        '@/lib/jarvis/operator/investigations/patterns'
      )
      return runInvestigationPattern({
        patternId: input.pattern_id,
        question: input.objective || input.question,
        days: input.days,
        systemsAllowed: input.systems_allowed,
        maxToolCalls: input.max_tool_calls,
        maxCostUsd: input.max_cost_usd,
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
    description:
      'Store a durable memory. Facts/rules require source. Lessons require evidence. Hypotheses must not claim causality. Prefer kind when known.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.005,
    timeoutMs: 10000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      category: z
        .enum([
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
        ])
        .optional(),
      kind: z
        .enum([
          'BUSINESS_FACT',
          'FACT',
          'USER_PREFERENCE',
          'PREFERENCE',
          'DECISION',
          'ACTION',
          'OUTCOME',
          'LESSON',
          'HYPOTHESIS',
          'OPERATING_RULE',
        ])
        .optional(),
      title: z.string().min(3),
      summary: z.string().min(10),
      funnelId: z.string().uuid().optional(),
      confidence: z.enum(['low', 'medium', 'high']).optional(),
      tags: z.array(z.string()).optional(),
      details: z.record(z.string(), z.unknown()).optional(),
      source: z.string().min(2).optional(),
      evidence: z.array(z.string()).optional(),
    }),
    execute: async (input, ctx) =>
      remember({
        ...input,
        actorId: ctx.actorId,
        source: input.source || (input.kind === 'USER_PREFERENCE' || input.kind === 'PREFERENCE' ? 'user_explicit' : undefined),
      }),
  })

  registerTool({
    name: 'memory.learning_query',
    description:
      'Answer learning questions from stored decisions/outcomes/lessons/preferences (e.g. "what have you learned?", "show preferences"). Observational only.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      query: z.string().min(3),
    }),
    execute: async (input) => {
      const { answerLearningQuery } = await import('@/lib/jarvis/memory/learning-loop')
      return answerLearningQuery(input.query)
    },
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

  // ── Phase 9: Content Operations ──────────────────────────────────────────
  registerTool({
    name: 'content_ops.get_queue',
    description:
      'Get the Instagram content operations queue: what needs attention, blockers, next actions. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    execute: async (input) => {
      const { getContentQueue, getContentOpsSummary } = await import('@/lib/jarvis/content-ops')
      const queue = await getContentQueue({ limit: input.limit })
      const summary = await getContentOpsSummary()
      return { ok: true, summary, ...queue }
    },
  })

  registerTool({
    name: 'content_ops.transition',
    description: 'Apply an explicit content ops state transition. Invalid transitions fail.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      contentId: z.string().uuid(),
      to: z.string().min(2),
      reason: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { transitionContentOps } = await import('@/lib/jarvis/content-ops')
      return transitionContentOps({
        contentId: input.contentId,
        to: input.to as import('@/lib/jarvis/content-ops').ContentOpsState,
        reason: input.reason,
        actor: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'content_ops.schedule',
    description:
      'Schedule approved content in the business timezone (Asia/Kolkata default). LOW_RISK for first schedule; requires APPROVED state.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      contentId: z.string().uuid(),
      dateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      timeHm: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      phrase: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const {
        scheduleContent,
        resolveRelativeSchedule,
      } = await import('@/lib/jarvis/content-ops')
      let dateYmd = input.dateYmd
      let timeHm = input.timeHm
      if (input.phrase) {
        const resolved = resolveRelativeSchedule(input.phrase)
        if (resolved) {
          dateYmd = dateYmd ?? resolved.dateYmd
          timeHm = timeHm ?? resolved.timeHm
        }
      }
      if (!dateYmd) {
        return { ok: false, error: 'dateYmd or resolvable phrase required', code: 'MISSING_DATE' }
      }
      return scheduleContent({
        contentId: input.contentId,
        dateYmd,
        timeHm,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'content_ops.reschedule',
    description:
      'Reschedule already-approved/scheduled content. SIGNIFICANT when it changes an external publish commitment.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({
      contentId: z.string().uuid(),
      dateYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timeHm: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }),
    execute: async (input, ctx) => {
      const { rescheduleContent } = await import('@/lib/jarvis/content-ops')
      return rescheduleContent({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'content_ops.cancel_schedule',
    description: 'Cancel a scheduled publish. SIGNIFICANT.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({ contentId: z.string().uuid() }),
    execute: async (input, ctx) => {
      const { cancelScheduledContent } = await import('@/lib/jarvis/content-ops')
      return cancelScheduledContent({ contentId: input.contentId, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'content_ops.propose_schedule',
    description:
      'Propose a content schedule from cadence + mix + queue/gaps/trends. Does not schedule or publish. No virality claims.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.05,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      cadence: z.union([z.enum(['3_per_week', '5_per_week', 'daily', 'custom']), z.number()]).optional(),
      postsPerWeek: z.number().int().min(0).max(21).optional(),
      days: z.number().int().min(1).max(14).optional(),
      mix: z.record(z.string(), z.number()).optional(),
      contentGaps: z.array(z.string()).optional(),
      trends: z.array(z.string()).optional(),
    }),
    execute: async (input, ctx) => {
      const { proposeContentBatch } = await import('@/lib/jarvis/content-ops')
      return proposeContentBatch({
        cadence: input.postsPerWeek ?? input.cadence ?? '3_per_week',
        mix: input.mix,
        days: input.days,
        contentGaps: input.contentGaps,
        trends: input.trends,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'content_ops.create_batch',
    description:
      'Create planned content items from an approved batch fingerprint. Plans only — does not auto-render.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.05,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ fingerprint: z.string().min(8) }),
    execute: async (input, ctx) => {
      const { executeApprovedBatch } = await import('@/lib/jarvis/content-ops')
      return executeApprovedBatch({
        fingerprint: input.fingerprint,
        actorId: ctx.actorId,
        createPlansOnly: true,
      })
    },
  })

  registerTool({
    name: 'content_ops.opportunity_from_trend',
    description:
      'Create a single content OPPORTUNITY from a trend/gap (bounded). Never auto-publishes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      title: z.string().min(3),
      objective: z.string().optional(),
      pillar: z.string().optional(),
      fingerprint: z.string().optional(),
      researchRef: z.string().optional(),
    }),
    execute: async (input, ctx) => {
      const { opportunityToQueueItem } = await import('@/lib/jarvis/content-ops')
      return opportunityToQueueItem({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'content_ops.prepare_publish_package',
    description: 'Build and store a publish package (caption + media refs). Does not publish.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      contentId: z.string().uuid(),
      caption: z.string().optional(),
      mediaUrl: z.string().url().optional(),
      videoJobId: z.string().uuid().optional(),
      mediaType: z.enum(['IMAGE', 'VIDEO', 'REELS']).optional(),
    }),
    execute: async (input) => {
      const { preparePublishPackageForContent } = await import('@/lib/jarvis/content-ops')
      return preparePublishPackageForContent(input)
    },
  })

  registerTool({
    name: 'content_ops.publish',
    description:
      'Publish approved Instagram content via existing Instagram Login provider. SIGNIFICANT. Requires LIVE_INSTAGRAM_PUBLISHING_ENABLED for live Graph publish. Idempotent.',
    riskClass: 'SIGNIFICANT',
    estimatedCostUsd: 0.05,
    timeoutMs: 90000,
    tokenBudget: 0,
    canRunAutonomously: false,
    auditRequired: true,
    requiresApproval: true,
    inputSchema: z.object({ contentId: z.string().uuid() }),
    execute: async (input, ctx) => {
      const { publishContentOps } = await import('@/lib/jarvis/content-ops')
      return publishContentOps({
        contentId: input.contentId,
        actorId: ctx.actorId,
        approved: Boolean(ctx.approvedExecution),
      })
    },
  })

  registerTool({
    name: 'content_ops.daily_brief',
    description: 'Build today\'s content operations brief.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}),
    execute: async () => {
      const { buildDailyContentBrief, formatDailyBriefText } = await import(
        '@/lib/jarvis/content-ops'
      )
      const brief = await buildDailyContentBrief()
      return { ok: true, brief, text: formatDailyBriefText(brief) }
    },
  })

  registerTool({
    name: 'content_ops.weekly_report',
    description: 'Build weekly content operations report (evidence-backed; no best/worst labels).',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}),
    execute: async () => {
      const { buildWeeklyContentReport } = await import('@/lib/jarvis/content-ops')
      const report = await buildWeeklyContentReport()
      return { ok: true, report }
    },
  })

  registerTool({
    name: 'content_ops.get_calendar',
    description: 'List scheduled content for day/week/month in business timezone.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({
      mode: z.enum(['day', 'week', 'month']).default('week'),
      anchorYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    execute: async (input) => {
      const { listCalendarItems } = await import('@/lib/jarvis/content-ops')
      const items = await listCalendarItems(input)
      return { ok: true, items, timezone: 'Asia/Kolkata' }
    },
  })

  registerTool({
    name: 'content_ops.provenance',
    description: 'Show provenance chain for a content item (research→…→metrics).',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ contentId: z.string().uuid() }),
    execute: async (input) => {
      const { getContentProvenance } = await import('@/lib/jarvis/content-ops')
      return getContentProvenance(input.contentId)
    },
  })

  // ── Phase 10: Autonomous Business Operator ───────────────────────────────
  registerTool({
    name: 'autonomous.business_pulse',
    description:
      'Unified business observation + health by area (REVENUE/MARKETING/CONTENT/…). Uses existing SOTs. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({}),
    execute: async () => {
      const { buildUnifiedObservation } = await import('@/lib/jarvis/autonomous')
      const obs = await buildUnifiedObservation()
      return {
        ok: true,
        observed_at: obs.observed_at,
        health: obs.health,
        findings: obs.findings.slice(0, 12),
        opportunities: obs.opportunities.slice(0, 8),
        revenue: obs.revenue,
        content: obs.content,
        systems: obs.systems,
        data_status: obs.data_status,
        limitations: obs.limitations,
      }
    },
  })

  registerTool({
    name: 'autonomous.attention_queue',
    description: 'What needs attention right now — deduplicated attention queue.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    timeoutMs: 20000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    execute: async (input) => {
      const { listOpenAttention } = await import('@/lib/jarvis/autonomous')
      const items = await listOpenAttention(input.limit ?? 30)
      return { ok: true, items, count: items.length }
    },
  })

  registerTool({
    name: 'autonomous.morning_brief',
    description: 'Get or build the concise morning business brief.',
    riskClass: 'READ',
    estimatedCostUsd: 0.04,
    timeoutMs: 60000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ rebuild: z.boolean().optional() }),
    execute: async (input) => {
      const {
        getLatestMorningBrief,
        buildUnifiedObservation,
        buildMorningBrief,
      } = await import('@/lib/jarvis/autonomous')
      if (!input.rebuild) {
        const existing = await getLatestMorningBrief()
        if (existing) return { ok: true, ...existing, rebuilt: false }
      }
      const obs = await buildUnifiedObservation()
      const brief = buildMorningBrief(obs)
      return { ok: true, text: brief.text, structured: brief.structured, rebuilt: true }
    },
  })

  registerTool({
    name: 'autonomous.what_happened',
    description:
      'Summarize what happened while the user was away (overnight summary). Evidence-backed.',
    riskClass: 'READ',
    estimatedCostUsd: 0.03,
    timeoutMs: 30000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ sinceHours: z.number().int().min(1).max(72).optional() }),
    execute: async (input) => {
      const { buildAwaySummary } = await import('@/lib/jarvis/autonomous')
      return buildAwaySummary({ sinceHours: input.sinceHours })
    },
  })

  registerTool({
    name: 'autonomous.explain_attention',
    description:
      'Explain why JARVIS is flagging something: OBSERVED / INFERENCE / UNCERTAIN / RECOMMENDATION / APPROVAL.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: false,
    inputSchema: z.object({ query: z.string().optional() }),
    execute: async (input) => {
      const { explainWhyTelling } = await import('@/lib/jarvis/autonomous')
      const text = await explainWhyTelling(input.query)
      return { ok: true, explanation: text }
    },
  })

  registerTool({
    name: 'autonomous.investigate',
    description:
      'Plan (and optionally run) a targeted cross-system investigation for an attention item. Does not apply significant Meta/Instagram writes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.2,
    timeoutMs: 120000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({
      fingerprint: z.string().min(8),
      allowExpensive: z.boolean().optional(),
    }),
    execute: async (input, ctx) => {
      const {
        listOpenAttention,
        buildUnifiedObservation,
        runBoundedInvestigation,
        ensureProactiveTask,
      } = await import('@/lib/jarvis/autonomous')
      const items = await listOpenAttention(50)
      const item = items.find((i) => i.fingerprint === input.fingerprint)
      if (!item) return { ok: false, error: 'attention_not_found' }
      const obs = await buildUnifiedObservation()
      const inv = await runBoundedInvestigation({
        attention: item,
        observation: obs,
        allowExpensive: input.allowExpensive === true,
        actorId: ctx.actorId,
      })
      const task = await ensureProactiveTask({ attention: item, actorId: ctx.actorId })
      return { ok: true, investigation: inv, task }
    },
  })

  registerTool({
    name: 'autonomous.take_care_plan',
    description:
      'Build a durable “take care of it” plan. Does NOT bypass SIGNIFICANT approvals. Plans only.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    timeoutMs: 15000,
    tokenBudget: 0,
    canRunAutonomously: true,
    auditRequired: true,
    inputSchema: z.object({ issue: z.string().min(3) }),
    execute: async (input) => {
      const { buildTakeCarePlan } = await import('@/lib/jarvis/autonomous')
      const plan = buildTakeCarePlan(input.issue)
      return {
        ok: true,
        plan,
        note: '"Take care of it" prepares a plan; significant actions still require approval.',
        action_state: 'PREPARED',
      }
    },
  })
}
