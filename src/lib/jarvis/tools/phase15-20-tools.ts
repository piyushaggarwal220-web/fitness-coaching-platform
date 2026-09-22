/**
 * Phases 15–20 tool registration — no unrestricted execute tools.
 * Phase 12 remains authoritative for significant writes.
 */

import { z } from 'zod'
import { registerTool } from '@/lib/jarvis/tools/registry'

let registered = false

export function registerPhase1520Tools(): void {
  if (registered) return
  registered = true

  // --- Phase 15 Opportunities ---
  registerTool({
    name: 'opportunities.list',
    description: 'List business opportunities (NOT niche/video tables). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({
      status: z.string().optional(),
      funnel_id: z.string().nullable().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async execute(input) {
      const { listOpportunities } = await import('@/lib/jarvis/opportunities')
      const rows = await listOpportunities({
        status: input.status as never,
        funnel_id: input.funnel_id,
        limit: input.limit,
      })
      return { ok: true, count: rows.length, opportunities: rows }
    },
  })

  registerTool({
    name: 'opportunities.get',
    description: 'Get one opportunity by id. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { getOpportunity } = await import('@/lib/jarvis/opportunities')
      const opp = await getOpportunity(input.id)
      return opp ? { ok: true, opportunity: opp } : { ok: false, error: 'not_found' }
    },
  })

  registerTool({
    name: 'opportunities.explain',
    description: 'Explain opportunity with OBSERVED/INFERRED/memory context. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 1200,
    auditRequired: false,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { explainOpportunity } = await import('@/lib/jarvis/opportunities')
      return explainOpportunity(input.id)
    },
  })

  registerTool({
    name: 'opportunities.investigate',
    description: 'Detect/persist opportunities from funnel performance. READ/analysis.',
    riskClass: 'READ',
    estimatedCostUsd: 0.03,
    canRunAutonomously: true,
    timeoutMs: 45_000,
    tokenBudget: 600,
    auditRequired: true,
    inputSchema: z.object({ days: z.number().int().min(1).max(90).optional() }),
    async execute(input) {
      const { detectAndPersistOpportunities } = await import('@/lib/jarvis/opportunities')
      return detectAndPersistOpportunities({ days: input.days })
    },
  })

  registerTool({
    name: 'opportunities.scenario',
    description: 'CPA/spend SCENARIO math (not a forecast). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    canRunAutonomously: true,
    timeoutMs: 5_000,
    tokenBudget: 200,
    auditRequired: false,
    inputSchema: z.object({
      spend_inr: z.number().nullable(),
      cpa_inr: z.number().nullable(),
      cpa_change_pct: z.number(),
    }),
    async execute(input) {
      const { runOpportunityScenario } = await import('@/lib/jarvis/opportunities')
      return runOpportunityScenario(input)
    },
  })

  registerTool({
    name: 'opportunities.dismiss',
    description: 'Dismiss opportunity (history retained). LOW_RISK admin.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 10_000,
    tokenBudget: 200,
    auditRequired: true,
    inputSchema: z.object({ id: z.string().uuid(), reason: z.string().min(3).max(500) }),
    async execute(input) {
      const { transitionOpportunity } = await import('@/lib/jarvis/opportunities')
      return transitionOpportunity({ id: input.id, status: 'DISMISSED', reason: input.reason })
    },
  })

  registerTool({
    name: 'opportunities.snooze',
    description: 'Snooze opportunity until a time. LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 10_000,
    tokenBudget: 200,
    auditRequired: true,
    inputSchema: z.object({
      id: z.string().uuid(),
      snooze_until: z.string(),
      reason: z.string().min(3).max(500).optional(),
    }),
    async execute(input) {
      const { transitionOpportunity } = await import('@/lib/jarvis/opportunities')
      return transitionOpportunity({
        id: input.id,
        status: 'SNOOZED',
        snooze_until: input.snooze_until,
        reason: input.reason,
      })
    },
  })

  registerTool({
    name: 'opportunities.watch',
    description: 'Mark opportunity VALIDATED/watch. LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 10_000,
    tokenBudget: 200,
    auditRequired: true,
    inputSchema: z.object({ id: z.string().uuid(), reason: z.string().optional() }),
    async execute(input) {
      const { transitionOpportunity } = await import('@/lib/jarvis/opportunities')
      return transitionOpportunity({ id: input.id, status: 'VALIDATED', reason: input.reason })
    },
  })

  registerTool({
    name: 'opportunities.health',
    description: 'Opportunity health diagnostics. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 300,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { getOpportunityHealth } = await import('@/lib/jarvis/opportunities')
      return { ok: true, ...(await getOpportunityHealth()) }
    },
  })

  registerTool({
    name: 'opportunities.review',
    description: 'Bucketed opportunity review. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 1000,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { reviewOpportunities } = await import('@/lib/jarvis/opportunities')
      return reviewOpportunities()
    },
  })

  // --- Phase 16 Strategy ---
  registerTool({
    name: 'strategy.goals',
    description: 'List durable goals. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    async execute(input) {
      const { listGoals } = await import('@/lib/jarvis/strategy')
      return { ok: true, goals: await listGoals(input.limit ?? 30) }
    },
  })

  registerTool({
    name: 'strategy.goal_get',
    description: 'Get one goal. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 8_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { getGoal, explainGoal } = await import('@/lib/jarvis/strategy')
      const g = await getGoal(input.id)
      return g ? { ok: true, goal: g, explain: explainGoal(g) } : { ok: false, error: 'not_found' }
    },
  })

  registerTool({
    name: 'strategy.plan',
    description: 'Create strategic plan (durable). LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    canRunAutonomously: false,
    timeoutMs: 15_000,
    tokenBudget: 400,
    auditRequired: true,
    inputSchema: z.object({
      name: z.string().min(2).max(200),
      objective: z.string().min(5).max(2000),
      goal_ids: z.array(z.string().uuid()).optional(),
      funnel_id: z.string().nullable().optional(),
    }),
    async execute(input, ctx) {
      const { createStrategicPlan } = await import('@/lib/jarvis/strategy')
      return createStrategicPlan({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'strategy.plan_get',
    description: 'Get strategic plan. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 8_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { getStrategicPlan } = await import('@/lib/jarvis/strategy')
      const p = await getStrategicPlan(input.id)
      return p ? { ok: true, plan: p } : { ok: false, error: 'not_found' }
    },
  })

  registerTool({
    name: 'strategy.review',
    description: 'Strategy review snapshot. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { strategyReview } = await import('@/lib/jarvis/strategy')
      return strategyReview()
    },
  })

  registerTool({
    name: 'strategy.replan',
    description: 'Supersede plan with replan record (requires approval for significant changes). LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.03,
    canRunAutonomously: false,
    timeoutMs: 20_000,
    tokenBudget: 500,
    auditRequired: true,
    inputSchema: z.object({
      plan_id: z.string().uuid(),
      reason: z.string().min(5).max(500),
      previous_assumption: z.string().min(3).max(500),
      new_evidence: z.string().min(3).max(1000),
      proposed_objective: z.string().max(2000).optional(),
    }),
    async execute(input, ctx) {
      const { replanStrategic } = await import('@/lib/jarvis/strategy')
      return replanStrategic({
        planId: input.plan_id,
        reason: input.reason,
        previous_assumption: input.previous_assumption,
        new_evidence: input.new_evidence,
        proposed_objective: input.proposed_objective,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'strategy.milestones',
    description: 'List milestones from active plans. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 500,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { listStrategicPlans } = await import('@/lib/jarvis/strategy')
      const plans = await listStrategicPlans(10)
      return {
        ok: true,
        milestones: plans.flatMap((p) =>
          (Array.isArray(p.milestones) ? p.milestones : []).map((m) => ({
            plan_id: p.id,
            plan: p.name,
            milestone: m,
          }))
        ),
      }
    },
  })

  registerTool({
    name: 'strategy.health',
    description: 'Strategy health. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 300,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { strategyHealth } = await import('@/lib/jarvis/strategy')
      return { ok: true, ...(await strategyHealth()) }
    },
  })

  registerTool({
    name: 'strategy.explain',
    description: 'Explain a goal. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 8_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({ goal_id: z.string().uuid() }),
    async execute(input) {
      const { getGoal, explainGoal } = await import('@/lib/jarvis/strategy')
      const g = await getGoal(input.goal_id)
      return g ? { ok: true, ...explainGoal(g) } : { ok: false, error: 'not_found' }
    },
  })

  // --- Phase 17 Growth ---
  registerTool({
    name: 'growth.snapshot',
    description: 'Cross-system growth snapshot. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 30_000,
    tokenBudget: 1000,
    auditRequired: false,
    inputSchema: z.object({ days: z.number().int().optional() }),
    async execute(input) {
      const { growthSnapshot } = await import('@/lib/jarvis/growth')
      return growthSnapshot(input)
    },
  })
  registerTool({
    name: 'growth.bottlenecks',
    description: 'Growth bottlenecks. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 30_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { growthBottlenecks } = await import('@/lib/jarvis/growth')
      return growthBottlenecks()
    },
  })
  registerTool({
    name: 'growth.opportunities',
    description: 'Growth-linked opportunities. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { growthOpportunities } = await import('@/lib/jarvis/growth')
      return growthOpportunities()
    },
  })
  registerTool({
    name: 'growth.health',
    description: 'Growth health. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 300,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { growthHealth } = await import('@/lib/jarvis/growth')
      return growthHealth()
    },
  })

  registerTool({
    name: 'growth.funnel_analysis',
    description: 'Per-funnel stage analysis (unavailable stages labeled). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({ funnel_id: z.string().nullable() }),
    async execute(input) {
      const { growthFunnelAnalysis } = await import('@/lib/jarvis/growth')
      return growthFunnelAnalysis(input.funnel_id)
    },
  })

  registerTool({
    name: 'growth.investigate',
    description: 'Cross-system investigate via existing patterns. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    canRunAutonomously: true,
    timeoutMs: 60_000,
    tokenBudget: 2000,
    auditRequired: true,
    inputSchema: z.object({ question: z.string().min(5).max(400) }),
    async execute(input) {
      const { growthInvestigate } = await import('@/lib/jarvis/growth')
      return growthInvestigate(input.question)
    },
  })

  registerTool({
    name: 'growth.scenario',
    description: 'Growth SCENARIO math + coordinated proposal outline. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 5_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({
      spend_inr: z.number().nullable(),
      cpa_inr: z.number().nullable(),
      cpa_change_pct: z.number(),
    }),
    async execute(input) {
      const { growthScenario } = await import('@/lib/jarvis/growth')
      return growthScenario(input)
    },
  })

  // --- Phase 18 Content intelligence ---
  registerTool({
    name: 'content.strategy',
    description: 'Content strategy snapshot (mix + opportunities). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { contentStrategySnapshot } = await import('@/lib/jarvis/content-intel')
      return contentStrategySnapshot()
    },
  })

  registerTool({
    name: 'content.opportunity',
    description: 'Map business opportunity → creative/content plan hints. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({ opportunity_id: z.string().uuid() }),
    async execute(input) {
      const { contentOpportunityToPlanHint } = await import('@/lib/jarvis/content-intel')
      return contentOpportunityToPlanHint(input.opportunity_id)
    },
  })

  registerTool({
    name: 'content.fatigue',
    description: 'Creative fatigue signals from existing classifier. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.03,
    canRunAutonomously: true,
    timeoutMs: 45_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { contentFatigue } = await import('@/lib/jarvis/content-intel')
      return contentFatigue()
    },
  })

  registerTool({
    name: 'content.performance',
    description: 'Taste vs strategy performance bridge. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { contentPerformanceBridge } = await import('@/lib/jarvis/content-intel')
      return contentPerformanceBridge()
    },
  })

  registerTool({
    name: 'content.batch_plan',
    description: 'Alias hint — use content_ops / creative.plan_batch for real batches. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 5_000,
    tokenBudget: 200,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      return {
        ok: true,
        use: ['content_ops.propose_batch', 'creative.plan_batch'],
        note: 'No duplicate batch planner — reuse Phase 5/9 tools.',
      }
    },
  })

  registerTool({
    name: 'content.production_plan',
    description: 'Production pipeline reminder. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    canRunAutonomously: true,
    timeoutMs: 3_000,
    tokenBudget: 200,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { contentStrategySnapshot } = await import('@/lib/jarvis/content-intel')
      const s = await contentStrategySnapshot()
      return { ok: true, pipeline: s.pipeline, note: s.note }
    },
  })

  registerTool({
    name: 'content.refresh',
    description: 'Refresh content intelligence health. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 30_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { contentIntelligenceHealth } = await import('@/lib/jarvis/content-intel')
      return contentIntelligenceHealth()
    },
  })

  // --- Phase 19 Finance ---
  registerTool({
    name: 'finance.snapshot',
    description: 'Financial snapshot (LURVOX + Meta by funnel). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 30_000,
    tokenBudget: 1000,
    auditRequired: false,
    inputSchema: z.object({ days: z.number().int().optional() }),
    async execute(input) {
      const { financeSnapshot } = await import('@/lib/jarvis/finance')
      return financeSnapshot(input)
    },
  })

  registerTool({
    name: 'finance.funnel',
    description: 'Per-funnel finance. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ funnel_id: z.string().nullable() }),
    async execute(input) {
      const { financeFunnel } = await import('@/lib/jarvis/finance')
      return financeFunnel(input.funnel_id)
    },
  })

  registerTool({
    name: 'finance.unit_economics',
    description: 'Unit economics for a funnel. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ funnel_id: z.string().nullable() }),
    async execute(input) {
      const { financeUnitEconomics } = await import('@/lib/jarvis/finance')
      return financeUnitEconomics(input.funnel_id)
    },
  })

  registerTool({
    name: 'finance.scenario',
    description: 'Finance SCENARIO calculator. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.005,
    canRunAutonomously: true,
    timeoutMs: 5_000,
    tokenBudget: 300,
    auditRequired: false,
    inputSchema: z.object({
      spend_inr: z.number().nullable(),
      cpa_inr: z.number().nullable(),
      spend_change_pct: z.number().optional(),
      cpa_change_pct: z.number().optional(),
    }),
    async execute(input) {
      const { financeScenario } = await import('@/lib/jarvis/finance')
      return financeScenario(input)
    },
  })

  registerTool({
    name: 'finance.trends',
    description: 'Finance trends across IST windows. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.03,
    canRunAutonomously: true,
    timeoutMs: 40_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({ days: z.number().int().optional() }),
    async execute(input) {
      const { financeTrends } = await import('@/lib/jarvis/finance')
      return financeTrends(input)
    },
  })

  registerTool({
    name: 'finance.anomalies',
    description: 'Finance anomalies (observed window diffs). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.03,
    canRunAutonomously: true,
    timeoutMs: 40_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { financeAnomalies } = await import('@/lib/jarvis/finance')
      return financeAnomalies()
    },
  })

  registerTool({
    name: 'finance.health',
    description: 'Finance health. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 300,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { financeHealth } = await import('@/lib/jarvis/finance')
      return financeHealth()
    },
  })

  // --- Phase 20 Experiments ---
  registerTool({
    name: 'experiments.create',
    description: 'Create experiment hypothesis on marketing_experiments. LOW_RISK. No live writes.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    canRunAutonomously: false,
    timeoutMs: 15_000,
    tokenBudget: 400,
    auditRequired: true,
    inputSchema: z.object({
      name: z.string().min(2).max(200),
      hypothesis: z.string().min(20).max(2000),
      variable: z.string().min(2).max(200),
      funnel_id: z.string().nullable().optional(),
      success_metric: z.string().optional(),
      control_description: z.string().optional(),
      treatment_description: z.string().optional(),
      minimum_spend: z.number().optional(),
      minimum_purchases: z.number().optional(),
      cost_limit_usd: z.number().optional(),
    }),
    async execute(input, ctx) {
      const { createExperiment } = await import('@/lib/jarvis/experiments')
      return createExperiment({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'experiments.get',
    description: 'Get experiment. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 8_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { getExperiment, explainExperiment } = await import('@/lib/jarvis/experiments')
      const row = await getExperiment(input.id)
      return row ? { ok: true, ...explainExperiment(row) } : { ok: false, error: 'not_found' }
    },
  })

  registerTool({
    name: 'experiments.list',
    description: 'List experiments. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().optional() }),
    async execute(input) {
      const { listExperiments } = await import('@/lib/jarvis/experiments')
      return { ok: true, experiments: await listExperiments(input.limit ?? 30) }
    },
  })

  registerTool({
    name: 'experiments.start',
    description: 'Mark experiment RUNNING (metadata only — no Meta writes). LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 10_000,
    tokenBudget: 200,
    auditRequired: true,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { transitionExperiment } = await import('@/lib/jarvis/experiments')
      return transitionExperiment({ id: input.id, lifecycle: 'RUNNING', status: 'running' })
    },
  })

  registerTool({
    name: 'experiments.pause',
    description: 'Pause experiment metadata. LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 10_000,
    tokenBudget: 200,
    auditRequired: true,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { transitionExperiment } = await import('@/lib/jarvis/experiments')
      return transitionExperiment({ id: input.id, lifecycle: 'DATA_COLLECTION', status: 'paused' })
    },
  })

  registerTool({
    name: 'experiments.stop',
    description: 'Stop experiment. LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 10_000,
    tokenBudget: 200,
    auditRequired: true,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { transitionExperiment } = await import('@/lib/jarvis/experiments')
      return transitionExperiment({ id: input.id, lifecycle: 'STOPPED', status: 'stopped' })
    },
  })

  registerTool({
    name: 'experiments.measure',
    description: 'Update measured spend/purchases + data sufficiency. LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 10_000,
    tokenBudget: 300,
    auditRequired: true,
    inputSchema: z.object({
      id: z.string().uuid(),
      spend: z.number(),
      purchases: z.number(),
    }),
    async execute(input) {
      const { transitionExperiment } = await import('@/lib/jarvis/experiments')
      return transitionExperiment({
        id: input.id,
        lifecycle: 'DATA_COLLECTION',
        spend: input.spend,
        purchases: input.purchases,
        result: { spend: input.spend, purchases: input.purchases },
      })
    },
  })

  registerTool({
    name: 'experiments.analyze',
    description: 'Analyze experiment without declaring causal certainty. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 500,
    auditRequired: false,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { getExperiment, analyzeExperiment } = await import('@/lib/jarvis/experiments')
      const row = await getExperiment(input.id)
      return row ? { ok: true, ...analyzeExperiment(row) } : { ok: false, error: 'not_found' }
    },
  })

  registerTool({
    name: 'experiments.conclude',
    description: 'Conclude experiment; optional lesson via Phase 14 gates. LOW_RISK.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.03,
    canRunAutonomously: false,
    timeoutMs: 30_000,
    tokenBudget: 600,
    auditRequired: true,
    inputSchema: z.object({
      id: z.string().uuid(),
      decision: z.string().min(3).max(500),
      observed: z.string().min(3).max(1000),
      promote_lesson: z.boolean().optional(),
    }),
    async execute(input, ctx) {
      const { concludeExperiment } = await import('@/lib/jarvis/experiments')
      return concludeExperiment({ ...input, actorId: ctx.actorId })
    },
  })

  registerTool({
    name: 'experiments.explain',
    description: 'Explain experiment. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 8_000,
    tokenBudget: 500,
    auditRequired: false,
    inputSchema: z.object({ id: z.string().uuid() }),
    async execute(input) {
      const { getExperiment, explainExperiment } = await import('@/lib/jarvis/experiments')
      const row = await getExperiment(input.id)
      return row ? { ok: true, ...explainExperiment(row) } : { ok: false, error: 'not_found' }
    },
  })

  registerTool({
    name: 'experiments.health',
    description: 'Experimentation health. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 300,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { experimentsHealth } = await import('@/lib/jarvis/experiments')
      return { ok: true, ...(await experimentsHealth()) }
    },
  })
}
