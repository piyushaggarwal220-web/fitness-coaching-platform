/**
 * Phase 12 execution status tools — read-only / explain. No unrestricted execute.
 */

import { z } from 'zod'
import { registerTool } from '@/lib/jarvis/tools/registry'
import { getExecutionConfig } from '@/lib/jarvis/execution/policy/config'
import { listRecentReceipts, getExecutionReceipt } from '@/lib/jarvis/execution/receipts'
import { explainExecutionDecision } from '@/lib/jarvis/execution/explain'
import { resolveAndEvaluatePolicy } from '@/lib/jarvis/execution/policy/resolve'
import { liveMetaExecutionEnabled } from '@/lib/ai-marketing/autonomy'
import { liveInstagramPublishingEnabled } from '@/lib/jarvis/instagram'

let registered = false

export function registerExecutionTools(): void {
  if (registered) return
  registered = true

  registerTool({
    name: 'execution.policy_status',
    description: 'Show kill switch, execution mode, limits, and live flags (no secrets).',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 0,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const config = await getExecutionConfig()
      return {
        ok: true,
        ...config,
        live_meta_execution: liveMetaExecutionEnabled(),
        live_instagram_publishing: liveInstagramPublishingEnabled(),
        note: 'Jarvis cannot enable live flags or clear kill switch via tools.',
      }
    },
  })

  registerTool({
    name: 'execution.preview',
    description: 'Preview policy decision for a tool without executing.',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 0,
    auditRequired: false,
    inputSchema: z.object({
      tool_name: z.string(),
      risk_class: z.string().default('SIGNIFICANT'),
      estimated_cost_usd: z.number().default(0.05),
    }),
    async execute(input) {
      const { result, facts } = await resolveAndEvaluatePolicy({
        toolName: input.tool_name,
        riskClass: input.risk_class,
        riskLevel: 'medium',
        estimatedCostUsd: input.estimated_cost_usd,
      })
      return {
        ok: true,
        decision: result.decision,
        code: result.code,
        reason: result.reason,
        action_class: result.action_class,
        system: result.system,
        autonomy_level: facts.autonomy_level,
        would_execute: result.decision === 'AUTO_EXECUTE',
        would_require_approval: result.decision === 'APPROVAL_REQUIRED',
      }
    },
  })

  registerTool({
    name: 'execution.receipt',
    description: 'Fetch a recent execution receipt by id (safe fields only).',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 0,
    auditRequired: false,
    inputSchema: z.object({ receipt_id: z.string().uuid() }),
    async execute(input) {
      const receipt = await getExecutionReceipt(input.receipt_id)
      return { ok: Boolean(receipt), receipt }
    },
  })

  registerTool({
    name: 'execution.limits',
    description: 'Show auto-execution cost and rate limits.',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    canRunAutonomously: true,
    timeoutMs: 5_000,
    tokenBudget: 0,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const config = await getExecutionConfig()
      return { ok: true, limits: config.limits, kill_switch: config.kill_switch }
    },
  })

  registerTool({
    name: 'execution.kill_switch_status',
    description: 'Whether the global execution kill switch is active.',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    canRunAutonomously: true,
    timeoutMs: 5_000,
    tokenBudget: 0,
    auditRequired: false,
    inputSchema: z.object({}),
    async execute() {
      const config = await getExecutionConfig()
      return {
        ok: true,
        kill_switch: config.kill_switch,
        note: config.note,
        jarvis_cannot_clear: true,
      }
    },
  })

  registerTool({
    name: 'execution.explain',
    description: 'Explain an execution decision from structured records.',
    riskClass: 'READ',
    estimatedCostUsd: 0,
    canRunAutonomously: true,
    timeoutMs: 10_000,
    tokenBudget: 0,
    auditRequired: false,
    inputSchema: z.object({
      question: z.string(),
      receipt_id: z.string().uuid().optional(),
    }),
    async execute(input) {
      const receipt = input.receipt_id ? await getExecutionReceipt(input.receipt_id) : null
      const explained = await explainExecutionDecision({
        question: input.question,
        receipt,
      })
      return { ok: true, ...explained, recent: await listRecentReceipts(5) }
    },
  })
}
