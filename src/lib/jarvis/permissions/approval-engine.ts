import { createAdminClient } from '@/lib/supabase/admin'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { evaluateToolPermission } from '@/lib/jarvis/permissions/risk-engine'
import { getTool } from '@/lib/jarvis/tools/registry'
import type { JarvisApprovalCard, ToolExecutionContext } from '@/lib/jarvis/types'
import { runTool } from '@/lib/jarvis/core/action-runner'

export async function createApprovalRequest(input: {
  conversationId: string | null
  taskId: string | null
  toolCallId: string
  toolName: string
  actionLabel: string
  reason: string
  evidence: string[]
  currentState: Record<string, unknown>
  proposedState: Record<string, unknown>
  expectedCostNote?: string
  riskLevel: string
  riskClass: string
  actorId?: string | null
}): Promise<JarvisApprovalCard> {
  const admin = createAdminClient()
  let ttlHours = 24
  try {
    const { getExecutionConfig } = await import('@/lib/jarvis/execution/policy/config')
    const cfg = await getExecutionConfig()
    ttlHours = cfg.limits.approval_ttl_hours
  } catch {
    /* default */
  }
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString()

  const { data, error } = await admin
    .from('jarvis_approvals')
    .insert({
      conversation_id: input.conversationId,
      task_id: input.taskId,
      tool_call_id: input.toolCallId,
      tool_name: input.toolName,
      action_label: input.actionLabel,
      reason: input.reason,
      evidence: input.evidence,
      current_state: input.currentState,
      proposed_state: input.proposedState,
      expected_cost_note: input.expectedCostNote ?? null,
      risk_level: input.riskLevel,
      risk_class: input.riskClass,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('*')
    .maybeSingle()

  // If expires_at column not migrated yet, retry without it
  let row = data
  let err = error
  if (error && /expires_at/i.test(error.message)) {
    const retry = await admin
      .from('jarvis_approvals')
      .insert({
        conversation_id: input.conversationId,
        task_id: input.taskId,
        tool_call_id: input.toolCallId,
        tool_name: input.toolName,
        action_label: input.actionLabel,
        reason: input.reason,
        evidence: input.evidence,
        current_state: input.currentState,
        proposed_state: input.proposedState,
        expected_cost_note: input.expectedCostNote ?? null,
        risk_level: input.riskLevel,
        risk_class: input.riskClass,
        status: 'pending',
      })
      .select('*')
      .maybeSingle()
    row = retry.data
    err = retry.error
  }

  if (err || !row) throw new Error(err?.message || 'Failed to create approval')

  await admin
    .from('jarvis_tool_calls')
    .update({
      approval_id: row.id,
      permission_result: 'requires_approval',
    })
    .eq('id', input.toolCallId)

  await admin.from('jarvis_notifications').insert({
    kind: 'approval',
    title: 'Approval required',
    body: input.actionLabel,
    link: '/admin/jarvis',
    metadata: { approval_id: row.id },
  })

  await writeMarketingAudit({
    agent: 'jarvis',
    decision: 'approval_requested',
    action: input.toolName,
    approval: 'pending',
    reasoning: input.reason,
    actor_id: input.actorId ?? null,
    execution_result: { approval_id: row.id, evidence: input.evidence },
  })

  return {
    id: row.id,
    action_label: row.action_label,
    reason: row.reason,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    current_state: (row.current_state as Record<string, unknown>) ?? {},
    proposed_state: (row.proposed_state as Record<string, unknown>) ?? {},
    expected_cost_note: row.expected_cost_note,
    risk_level: row.risk_level,
    risk_class: row.risk_class,
    tool_name: row.tool_name,
    status: row.status,
  }
}

export async function resolveApproval(input: {
  approvalId: string
  approve: boolean
  actorId: string
  modification?: Record<string, unknown>
}): Promise<{ ok: boolean; error?: string; execution?: unknown }> {
  const admin = createAdminClient()
  const { data: approval, error } = await admin
    .from('jarvis_approvals')
    .select('*')
    .eq('id', input.approvalId)
    .maybeSingle()

  if (error || !approval) return { ok: false, error: 'Approval not found' }
  if (approval.status !== 'pending') {
    return { ok: false, error: `Approval already ${approval.status}` }
  }

  // Phase 12 — approval expiration
  const expiresAt = approval.expires_at ? Date.parse(String(approval.expires_at)) : NaN
  if (Number.isFinite(expiresAt) && Date.now() > expiresAt) {
    await admin
      .from('jarvis_approvals')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', input.approvalId)
    return { ok: false, error: 'This approval has expired. Prepare the action again.' }
  }

  // Kill switch blocks post-approval external writes
  try {
    const { getExecutionConfig } = await import('@/lib/jarvis/execution/policy/config')
    const cfg = await getExecutionConfig()
    if (cfg.kill_switch && input.approve) {
      return {
        ok: false,
        error: 'Kill switch is active — approved writes cannot execute until an admin clears it.',
      }
    }
  } catch {
    /* continue */
  }

  if (!input.approve) {
    await admin
      .from('jarvis_approvals')
      .update({
        status: 'rejected',
        decided_by: input.actorId,
        decided_at: new Date().toISOString(),
      })
      .eq('id', approval.id)

    await writeMarketingAudit({
      agent: 'jarvis',
      decision: 'approval_rejected',
      action: approval.tool_name,
      approval: 'rejected',
      actor_id: input.actorId,
      related_action_id: null,
    })
    return { ok: true, execution: { status: 'rejected' } }
  }

  const proposed = {
    ...((approval.proposed_state as Record<string, unknown>) ?? {}),
    ...(input.modification ?? {}),
  }

  await admin
    .from('jarvis_approvals')
    .update({
      status: input.modification ? 'modified' : 'approved',
      modification: input.modification ?? null,
      proposed_state: proposed,
      decided_by: input.actorId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', approval.id)

  const tool = getTool(approval.tool_name)
  if (!tool) {
    await admin
      .from('jarvis_approvals')
      .update({ status: 'failed', error: 'Tool no longer registered' })
      .eq('id', approval.id)
    return { ok: false, error: 'Tool no longer registered' }
  }

  const perm = await evaluateToolPermission({
    toolName: approval.tool_name,
    approvedExecution: true,
    source: 'chat',
  })

  if (!perm.allowed || perm.mode !== 'execute') {
    const note =
      !perm.allowed
        ? perm.reason
        : perm.reason
    await admin
      .from('jarvis_approvals')
      .update({
        status: 'executed',
        execution_result: { status: 'recorded_not_executed', note },
      })
      .eq('id', approval.id)

    await writeMarketingAudit({
      agent: 'jarvis',
      decision: 'approval_recorded_blocked_execution',
      action: approval.tool_name,
      approval: 'approved',
      actor_id: input.actorId,
      reasoning: note,
    })
    return { ok: true, execution: { status: 'recorded_not_executed', note } }
  }

  const ctx: ToolExecutionContext = {
    actorId: input.actorId,
    conversationId: approval.conversation_id,
    taskId: approval.task_id,
    source: 'chat',
    approvedExecution: true,
    approvalId: approval.id,
  }

  try {
    const result = await runTool(approval.tool_name, proposed, ctx, {
      skipPermissionCheck: true,
    })
    await admin
      .from('jarvis_approvals')
      .update({
        status: 'executed',
        execution_result: result,
      })
      .eq('id', approval.id)

    await writeMarketingAudit({
      agent: 'jarvis',
      decision: 'approval_executed',
      action: approval.tool_name,
      approval: 'approved',
      actor_id: input.actorId,
      execution_result: result as Record<string, unknown>,
    })

    // Link decision ledger if a waiting decision exists for this approval
    try {
      const { createAdminClient: adminClient } = await import('@/lib/supabase/admin')
      const a = adminClient()
      const { data: decision } = await a
        .from('jarvis_decisions')
        .select('id')
        .eq('related_approval_id', approval.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (decision?.id) {
        const { linkActionToDecision, scheduleOutcomeCheck } = await import(
          '@/lib/jarvis/memory/learning-loop'
        )
        await linkActionToDecision({
          decisionId: decision.id,
          actionStatus: result.status === 'executed' ? 'executed' : 'recorded_not_executed',
          actionResult: result as unknown as Record<string, unknown>,
          relatedApprovalId: approval.id,
        })
        if (result.status === 'executed') {
          await scheduleOutcomeCheck({ decisionId: decision.id })
        }
      }
    } catch {
      // non-fatal
    }

    return { ok: true, execution: result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution failed'
    await admin
      .from('jarvis_approvals')
      .update({ status: 'failed', error: message })
      .eq('id', approval.id)
    return { ok: false, error: message }
  }
}

export async function listPendingApprovals(limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_approvals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}
