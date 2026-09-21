import { createAdminClient } from '@/lib/supabase/admin'
import { getTool } from '@/lib/jarvis/tools/registry'
import { evaluateToolPermission } from '@/lib/jarvis/permissions/risk-engine'
import { createApprovalRequest } from '@/lib/jarvis/permissions/approval-engine'
import { assertAiBudgetAvailable, recordCostUsage } from '@/lib/jarvis/cost/usage'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
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
    const approval = await createApprovalRequest({
      conversationId: ctx.conversationId,
      taskId: ctx.source === 'chat' && ctx.taskId && ctx.taskId !== 'approved' ? ctx.taskId : null,
      toolCallId,
      toolName,
      actionLabel: `${toolName}`,
      reason: perm.reason,
      evidence: [`Tool: ${toolName}`, `Risk: ${tool.riskClass}`],
      currentState: {},
      proposedState: parsed.data as Record<string, unknown>,
      expectedCostNote: `Est. AI/tool cost ~$${tool.estimatedCostUsd}`,
      riskLevel: perm.riskLevel,
      riskClass: tool.riskClass,
      actorId: ctx.actorId,
    })
    return {
      status: 'requires_approval',
      toolCallId,
      approval,
      summary: `Approval required: ${toolName}`,
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

    return {
      status: 'executed',
      toolCallId,
      output,
      summary: summarizeOutput(output),
      riskClass: tool.riskClass,
      costUsd,
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
