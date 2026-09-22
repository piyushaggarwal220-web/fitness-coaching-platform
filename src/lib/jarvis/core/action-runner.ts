import { createAdminClient } from '@/lib/supabase/admin'
import { getTool } from '@/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '@/lib/jarvis/permissions/risk-engine'
import { createApprovalRequest } from '@/lib/jarvis/permissions/approval-engine'
import {
  buildApprovalBriefing,
  enrichmentForApprovalRow,
} from '@/lib/jarvis/permissions/approval-briefing'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import {
  verifyAfterWrite,
  formatVerificationForOperator,
} from '@/lib/jarvis/core/verify-after-write'
import type { JarvisApprovalCard, ToolExecutionContext } from '@/lib/jarvis/types'

export type RunToolResult = {
  status: 'executed' | 'requires_approval' | 'blocked' | 'failed' | 'budget_exhausted'
  toolCallId?: string
  output?: unknown
  approval?: JarvisApprovalCard
  error?: string
  summary: string
  riskClass: string
  costUsd: number
  verification?: {
    state: string
    summary: string
  }
}

export async function runTool(
  toolName: string,
  rawInput: unknown,
  ctx: ToolExecutionContext,
  opts?: { skipPermissionCheck?: boolean }
): Promise<RunToolResult> {
  const tool = getTool(toolName)
  if (!tool) {
    return {
      status: 'blocked',
      error: `Unknown tool ${toolName}`,
      summary: `Blocked unknown tool ${toolName}`,
      riskClass: 'DANGEROUS',
      costUsd: 0,
    }
  }

  const parsed = tool.inputSchema.safeParse(rawInput ?? {})
  if (!parsed.success) {
    return {
      status: 'failed',
      error: parsed.error.message,
      summary: `Invalid input for ${toolName}`,
      riskClass: tool.riskClass,
      costUsd: 0,
    }
  }

  const budget = await assertAiBudgetAvailable(tool.estimatedCostUsd)
  if (!budget.ok) {
    return {
      status: 'budget_exhausted',
      error: budget.reason,
      summary: budget.reason,
      riskClass: tool.riskClass,
      costUsd: 0,
    }
  }

  const admin = createAdminClient()
  const { data: toolCallRow } = await admin
    .from('jarvis_tool_calls')
    .insert({
      task_id:
        ctx.taskId && ctx.taskId !== 'approved' && ctx.source === 'chat' ? ctx.taskId : null,
      conversation_id: ctx.conversationId,
      tool_name: toolName,
      input: parsed.data as object,
      risk_class: tool.riskClass,
      permission_result: 'pending',
      estimated_cost_usd: tool.estimatedCostUsd,
    })
    .select('id')
    .maybeSingle()

  const toolCallId = toolCallRow?.id as string | undefined

  let perm = await evaluateToolPermission({
    toolName,
    approvedExecution: ctx.approvedExecution,
    source: ctx.source,
  })

  if (opts?.skipPermissionCheck && ctx.approvedExecution) {
    perm = {
      allowed: true,
      mode: 'execute',
      riskClass: tool.riskClass,
      riskLevel: 'medium',
      reason: 'Post-approval execution',
    }
  }

  if (!perm.allowed) {
    if (toolCallId) {
      await admin
        .from('jarvis_tool_calls')
        .update({
          permission_result: 'blocked',
          error: perm.reason,
          completed_at: new Date().toISOString(),
        })
        .eq('id', toolCallId)
    }
    await writeMarketingAudit({
      agent: 'jarvis',
      decision: 'tool_blocked',
      action: toolName,
      reasoning: perm.reason,
      actor_id: ctx.actorId,
    })
    return {
      status: 'blocked',
      toolCallId,
      error: perm.reason,
      summary: perm.reason,
      riskClass: tool.riskClass,
      costUsd: 0,
    }
  }

  if (perm.mode === 'require_approval') {
    if (!toolCallId) {
      return {
        status: 'failed',
        error: 'Failed to record tool call for approval',
        summary: 'Failed to record tool call',
        riskClass: tool.riskClass,
        costUsd: 0,
      }
    }
    const briefing = buildApprovalBriefing({
      toolName,
      riskClass: tool.riskClass,
      riskLevel: perm.riskLevel,
      reason: perm.reason,
      toolInput: parsed.data as Record<string, unknown>,
      estimatedCostUsd: tool.estimatedCostUsd,
    })
    const enriched = enrichmentForApprovalRow(briefing)
    const approval = await createApprovalRequest({
      conversationId: ctx.conversationId,
      taskId: ctx.source === 'chat' && ctx.taskId && ctx.taskId !== 'approved' ? ctx.taskId : null,
      toolCallId,
      toolName,
      actionLabel: enriched.actionLabel,
      reason: briefing.why,
      evidence: enriched.evidence,
      currentState: enriched.currentState,
      proposedState: enriched.proposedState,
      expectedCostNote: enriched.expectedCostNote,
      riskLevel: perm.riskLevel,
      riskClass: tool.riskClass,
      actorId: ctx.actorId,
    })

    void maybeRecordLearningDecision({
      toolName,
      toolInput: parsed.data as Record<string, unknown>,
      toolCallId,
      ctx,
      actionStatus: 'waiting_for_approval',
      approvalId: approval.id,
      scheduleMeasurement: false,
    }).catch(() => null)

    return {
      status: 'requires_approval',
      toolCallId,
      approval,
      summary: `Approval required: ${briefing.what}`,
      riskClass: tool.riskClass,
      costUsd: 0,
    }
  }

  const started = Date.now()
  try {
    const output = await Promise.race([
      tool.execute(parsed.data, ctx),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool timeout ${tool.timeoutMs}ms`)), tool.timeoutMs)
      ),
    ])

    const costUsd = await recordCostUsage({
      category: 'tool',
      toolName,
      taskId: ctx.source === 'chat' && ctx.taskId && ctx.taskId !== 'approved' ? ctx.taskId : null,
      conversationId: ctx.conversationId,
      costUsd: tool.estimatedCostUsd,
      metadata: { executed: true },
    })

    if (toolCallId) {
      await admin
        .from('jarvis_tool_calls')
        .update({
          permission_result: 'executed',
          output: output as object,
          actual_cost_usd: costUsd,
          duration_ms: Date.now() - started,
          completed_at: new Date().toISOString(),
        })
        .eq('id', toolCallId)
    }

    if (tool.auditRequired) {
      await writeMarketingAudit({
        agent: 'jarvis',
        decision: 'tool_executed',
        action: toolName,
        actor_id: ctx.actorId,
        execution_result: { toolCallId, summary: summarizeOutput(output) },
      })
    }

    let verification:
      | { state: string; summary: string }
      | undefined
    if (tool.riskClass !== 'READ') {
      const v = await verifyAfterWrite({
        toolName,
        riskClass: tool.riskClass,
        output,
        ctx,
      })
      verification = {
        state: v.state,
        summary: formatVerificationForOperator(v),
      }
      if (toolCallId) {
        await admin
          .from('jarvis_tool_calls')
          .update({
            output: {
              ...(typeof output === 'object' && output ? (output as object) : { value: output }),
              _verification: verification,
            },
          })
          .eq('id', toolCallId)
      }
    }

    const baseSummary = summarizeOutput(output)
    // Phase 3: durable decision + scheduled measurement for significant writes
    if (tool.riskClass === 'SIGNIFICANT' || tool.riskClass === 'DANGEROUS') {
      void maybeRecordLearningDecision({
        toolName,
        toolInput: parsed.data as Record<string, unknown>,
        toolCallId,
        ctx,
        actionStatus: 'executed',
        actionResult: { summary: baseSummary },
        verificationState: verification?.state ?? null,
        approvalId: ctx.approvalId ?? null,
      }).catch(() => null)
    }

    return {
      status: 'executed',
      toolCallId,
      output,
      summary: verification ? `${baseSummary} | ${verification.summary}` : baseSummary,
      riskClass: tool.riskClass,
      costUsd,
      verification,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool failed'
    if (toolCallId) {
      await admin
        .from('jarvis_tool_calls')
        .update({
          permission_result: 'failed',
          error: message,
          duration_ms: Date.now() - started,
          completed_at: new Date().toISOString(),
        })
        .eq('id', toolCallId)
    }
    return {
      status: 'failed',
      toolCallId,
      error: message,
      summary: message,
      riskClass: tool.riskClass,
      costUsd: 0,
    }
  }
}

function summarizeOutput(output: unknown): string {
  if (output == null) return 'ok'
  if (typeof output === 'string') return output.slice(0, 240)
  try {
    return JSON.stringify(output).slice(0, 240)
  } catch {
    return 'ok'
  }
}

async function maybeRecordLearningDecision(input: {
  toolName: string
  toolInput: Record<string, unknown>
  toolCallId?: string
  ctx: ToolExecutionContext
  actionStatus:
    | 'waiting_for_approval'
    | 'executed'
    | 'verified'
    | 'failed'
    | 'blocked'
    | 'recorded_not_executed'
  actionResult?: Record<string, unknown>
  verificationState?: string | null
  approvalId?: string | null
  scheduleMeasurement?: boolean
}) {
  // Skip pure analytics / memory tools
  if (
    input.toolName.startsWith('memory.') ||
    input.toolName.startsWith('analytics.') ||
    input.toolName.startsWith('system.') ||
    input.toolName.startsWith('diagnostics.')
  ) {
    return
  }

  const { recordDecisionActionAndSchedule } = await import('@/lib/jarvis/memory/learning-loop')
  const { defaultWindowForTool } = await import('@/lib/jarvis/memory/scopes')

  const system = input.toolName.split('.')[0] || 'meta'
  const objective = `${input.toolName}: ${JSON.stringify(input.toolInput).slice(0, 180)}`
  const baseline: Record<string, unknown> = {}
  const metrics: { metric: string; baseline: number | null; direction: 'maintain' | 'increase' | 'decrease' | 'unavailable'; target?: number | null }[] = []

  // Prefer configured targets when present on input; otherwise qualitative
  if (typeof input.toolInput.target_cpa === 'number') {
    metrics.push({
      metric: 'cpa',
      baseline: typeof input.toolInput.baseline_cpa === 'number' ? (input.toolInput.baseline_cpa as number) : null,
      target: input.toolInput.target_cpa as number,
      direction: 'maintain',
    })
  }

  await recordDecisionActionAndSchedule({
    objective,
    system,
    scope: system === 'instagram' ? 'INSTAGRAM_ACCOUNT' : system === 'meta' ? 'AD_SET' : 'GLOBAL_BUSINESS',
    scopeId:
      (input.toolInput.adset_id as string) ||
      (input.toolInput.funnel_id as string) ||
      (input.toolInput.campaign_id as string) ||
      null,
    reason: `Significant tool ${input.toolName} — expected outcome recorded before measurement.`,
    evidence: [`tool:${input.toolName}`, input.toolCallId ? `tool_call:${input.toolCallId}` : 'tool_call:unknown'],
    expectedOutcome: {
      metrics,
      qualitative:
        metrics.length === 0
          ? 'No explicit numeric success criterion configured for this action — outcome will be qualitative or unavailable.'
          : undefined,
    },
    baseline,
    baselineSource:
      metrics.length > 0
        ? 'tool_input / configured target when provided'
        : 'unavailable — no explicit baseline on tool input',
    measurementWindowHours: defaultWindowForTool(input.toolName),
    risk: 'high',
    approvalRequired: input.actionStatus === 'waiting_for_approval',
    approvalStatus:
      input.actionStatus === 'waiting_for_approval'
        ? 'pending'
        : input.ctx.approvedExecution
          ? 'approved'
          : 'not_required',
    source: input.ctx.approvedExecution ? 'JARVIS' : input.ctx.source === 'cron' ? 'SYSTEM_AUTOMATION' : 'JARVIS',
    toolName: input.toolName,
    actionInput: input.toolInput,
    actionStatus: input.actionStatus,
    actionResult: input.actionResult,
    verificationState: input.verificationState,
    relatedApprovalId: input.approvalId,
    relatedTaskId: input.ctx.taskId,
    relatedToolCallId: input.toolCallId,
    actorId: input.ctx.actorId,
    scheduleMeasurement: input.scheduleMeasurement ?? input.actionStatus === 'executed',
  })
}
