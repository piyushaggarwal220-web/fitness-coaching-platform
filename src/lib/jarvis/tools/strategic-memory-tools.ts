/**
 * Phase 14 strategic memory tools — no unrestricted mutation.
 */

import { z } from 'zod'
import { registerTool } from '@/lib/jarvis/tools/registry'
import {
  searchStrategicMemory,
  buildBusinessKnowledgeSnapshot,
  runStrategicReview,
  explainMemory,
  listOpenConflicts,
  applyMemoryAdminAction,
  getStrategicMemoryHealth,
  runStrategicMemoryMaintenance,
} from '@/lib/jarvis/memory/strategic'

let registered = false

export function registerStrategicMemoryTools(): void {
  if (registered) return
  registered = true

  registerTool({
    name: 'memory.search_strategic',
    description: 'Bounded strategic memory search (patterns, lessons, rules, insights). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 1200,
    auditRequired: false,
    inputSchema: z.object({
      query: z.string().min(1).max(400),
      funnel_id: z.string().nullable().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    async execute(input) {
      const result = await searchStrategicMemory({
        query: input.query,
        funnelId: input.funnel_id,
        limit: input.limit,
      })
      return {
        ok: true,
        count: result.memories.length,
        conflicts: result.conflicts,
        memories: result.memories.map((m) => ({
          id: m.id,
          title: m.title,
          summary: m.summary.slice(0, 240),
          confidence: m.confidence,
          funnel_id: m.funnel_id,
          status: m.memory_status,
        })),
        note: 'Conflicts are surfaced — never silently resolved.',
      }
    },
  })

  registerTool({
    name: 'memory.explain',
    description: 'Explain a memory with provenance and evidence. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 800,
    auditRequired: false,
    inputSchema: z.object({ memory_id: z.string().uuid() }),
    async execute(input) {
      return explainMemory(input.memory_id)
    },
  })

  registerTool({
    name: 'memory.strategic_review',
    description:
      'Bounded strategic review: patterns, lessons, conflicts, stale assumptions. Cost-gated.',
    riskClass: 'READ',
    estimatedCostUsd: 0.05,
    canRunAutonomously: true,
    timeoutMs: 30_000,
    tokenBudget: 2000,
    auditRequired: false,
    inputSchema: z.object({
      query: z.string().optional(),
      funnel_id: z.string().nullable().optional(),
    }),
    async execute(input) {
      return runStrategicReview({ query: input.query, funnelId: input.funnel_id })
    },
  })

  registerTool({
    name: 'memory.business_snapshot',
    description: 'Compact business knowledge snapshot (bounded sections). READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.02,
    canRunAutonomously: true,
    timeoutMs: 20_000,
    tokenBudget: 1500,
    auditRequired: false,
    inputSchema: z.object({ funnel_id: z.string().nullable().optional() }),
    async execute(input) {
      const snapshot = await buildBusinessKnowledgeSnapshot({ funnelId: input.funnel_id })
      return { ok: true, snapshot }
    },
  })

  registerTool({
    name: 'memory.list_conflicts',
    description: 'List open strategic memory conflicts. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 600,
    auditRequired: false,
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    async execute(input) {
      const conflicts = await listOpenConflicts(input.limit ?? 20)
      return { ok: true, count: conflicts.length, conflicts }
    },
  })

  registerTool({
    name: 'memory.health',
    description: 'Strategic memory health diagnostics. READ.',
    riskClass: 'READ',
    estimatedCostUsd: 0.01,
    canRunAutonomously: true,
    timeoutMs: 15_000,
    tokenBudget: 400,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      return { ok: true, ...(await getStrategicMemoryHealth()) }
    },
  })

  registerTool({
    name: 'memory.confirm',
    description: 'Admin confirm a candidate strategic memory. Does not execute external actions.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 15_000,
    tokenBudget: 300,
    auditRequired: true,
    inputSchema: z.object({
      memory_id: z.string().uuid(),
      reason: z.string().min(3).max(500),
    }),
    async execute(input, ctx) {
      if (!ctx.actorId) return { ok: false, error: 'admin_actor_required' }
      return applyMemoryAdminAction({
        memoryId: input.memory_id,
        action: 'CONFIRM',
        reason: input.reason,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'memory.reject',
    description: 'Admin reject/archive a candidate memory. History retained as ARCHIVED.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.01,
    canRunAutonomously: false,
    timeoutMs: 15_000,
    tokenBudget: 300,
    auditRequired: true,
    inputSchema: z.object({
      memory_id: z.string().uuid(),
      reason: z.string().min(3).max(500),
    }),
    async execute(input, ctx) {
      if (!ctx.actorId) return { ok: false, error: 'admin_actor_required' }
      return applyMemoryAdminAction({
        memoryId: input.memory_id,
        action: 'REJECT',
        reason: input.reason,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'memory.correct',
    description:
      'Admin correction: supersedes prior memory with USER_EXPLICIT correction. Does not erase history.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.02,
    canRunAutonomously: false,
    timeoutMs: 20_000,
    tokenBudget: 400,
    auditRequired: true,
    inputSchema: z.object({
      memory_id: z.string().uuid(),
      reason: z.string().min(3).max(500),
      correction_summary: z.string().min(3).max(2000),
    }),
    async execute(input, ctx) {
      if (!ctx.actorId) return { ok: false, error: 'admin_actor_required' }
      return applyMemoryAdminAction({
        memoryId: input.memory_id,
        action: 'CORRECT',
        reason: input.reason,
        correctionSummary: input.correction_summary,
        actorId: ctx.actorId,
      })
    },
  })

  registerTool({
    name: 'memory.maintenance',
    description: 'Bounded stale/conflict maintenance. Never deletes history.',
    riskClass: 'LOW_RISK',
    estimatedCostUsd: 0.03,
    canRunAutonomously: false,
    timeoutMs: 45_000,
    tokenBudget: 500,
    auditRequired: true,
    inputSchema: z.object({}),
    async execute() {
      return { ok: true, ...(await runStrategicMemoryMaintenance()) }
    },
  })
}
