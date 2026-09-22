/**
 * Phase 21 long-horizon tools — extend Phase 16; no unrestricted execute.
 */

import { z } from 'zod'
import { registerTool } from '@/lib/jarvis/tools/registry'

let registered = false

export function registerLongHorizonTools(): void {
  if (registered) return
  registered = true

  registerTool({
    name: 'strategy.long_horizon_review',
    description: 'Review active long-horizon plans (bounded). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.04,
    canRunAutonomously: true,
    timeoutMs: 60_000,
    tokenBudget: 1500,
    auditRequired: true,
    inputSchema: z.object({ plan_id: z.string().uuid().optional() }),
    async execute(input) {
      const { reviewLongHorizonPlan, longHorizonReviewAll } = await import(
        '@/lib/jarvis/strategy/long-horizon'
      )
      if (input.plan_id) return reviewLongHorizonPlan(input.plan_id)
      return longHorizonReviewAll()
    },
  })

  registerTool({
    name: 'strategy.plan_health',
    description: 'Long-horizon plan health diagnostics. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { longHorizonHealth } = await import('@/lib/jarvis/strategy/long-horizon')
      return { ok: true, ...(await longHorizonHealth()) }
    },
  })

  registerTool({
    name: 'strategy.next_actions',
    description: 'Explained next actions across plans/opportunities. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 25_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { nextActionsForPlans } = await import('@/lib/jarvis/strategy/long-horizon')
      return nextActionsForPlans()
    },
  })

  registerTool({
    name: 'strategy.dependencies',
    description: 'Dependency graph + blockers for a plan. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ plan_id: z.string().uuid() }),
    async execute(input) {
      const { buildDependencyGraph } = await import('@/lib/jarvis/strategy/long-horizon')
      return buildDependencyGraph(input.plan_id)
    },
  })

  registerTool({
    name: 'strategy.priorities',
    description: 'Attention-budgeted priorities (explained bands). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 700,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { attentionBudget } = await import('@/lib/jarvis/strategy/long-horizon')
      return attentionBudget()
    },
  })

  registerTool({
    name: 'strategy.resume',
    description: 'List resumable durable long-horizon plans. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { resumeLongHorizon } = await import('@/lib/jarvis/strategy/long-horizon')
      return resumeLongHorizon()
    },
  })

  registerTool({
    name: 'strategy.replan_proposal',
    description: 'Propose replan (does not rewrite). LOW_RISK metadata.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    canRunAutonomously: false,
    timeoutMs: 30_000,
    tokenBudget: 600,
    auditRequired: true,
    inputSchema: z.object({ plan_id: z.string().uuid() }),
    async execute(input) {
      const { replanProposal } = await import('@/lib/jarvis/strategy/long-horizon')
      return replanProposal(input.plan_id)
    },
  })

  registerTool({
    name: 'strategy.attention',
    description: 'Bounded attention budget for the operator. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const { attentionBudget } = await import('@/lib/jarvis/strategy/long-horizon')
      return attentionBudget()
    },
  })
}
