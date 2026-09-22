/**
 * Durable execution receipts — no secrets.
 */

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ActionClass,
  ExecutionDecision,
  ExecutionReceipt,
  ExecutionSystem,
  ReceiptStatus,
} from '@/lib/jarvis/execution/policy/types'

const memoryReceipts = new Map<string, ExecutionReceipt>()
const byIdempotency = new Map<string, string>()

function sanitizeState(state: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(state)) {
    const key = k.toLowerCase()
    if (
      key.includes('token') ||
      key.includes('secret') ||
      key.includes('password') ||
      key.includes('authorization') ||
      key.includes('api_key')
    ) {
      out[k] = '[redacted]'
      continue
    }
    out[k] = v
  }
  return out
}

export async function findReceiptByIdempotency(
  key: string
): Promise<ExecutionReceipt | null> {
  const memId = byIdempotency.get(key)
  if (memId) {
    const r = memoryReceipts.get(memId)
    if (r) return r
  }
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('jarvis_execution_receipts')
      .select('*')
      .eq('idempotency_key', key)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return rowToReceipt(data as Record<string, unknown>)
  } catch {
    return null
  }
}

function rowToReceipt(row: Record<string, unknown>): ExecutionReceipt {
  return {
    id: String(row.id),
    action_id: (row.action_id as string) ?? null,
    task_id: (row.task_id as string) ?? null,
    decision_id: (row.decision_id as string) ?? null,
    tool_call_id: (row.tool_call_id as string) ?? null,
    admin_user_id: (row.admin_user_id as string) ?? null,
    system: row.system as ExecutionSystem,
    action_class: row.action_class as ActionClass,
    tool_name: String(row.tool_name),
    target_type: (row.target_type as string) ?? null,
    target_id: (row.target_id as string) ?? null,
    idempotency_key: String(row.idempotency_key),
    status: row.status as ReceiptStatus,
    policy_decision: (row.policy_decision as ExecutionDecision) ?? null,
    policy_reason: (row.policy_reason as string) ?? null,
    estimated_cost_usd: Number(row.estimated_cost_usd ?? 0),
    actual_cost_usd: row.actual_cost_usd != null ? Number(row.actual_cost_usd) : null,
    before_state: (row.before_state as Record<string, unknown>) ?? {},
    after_state: (row.after_state as Record<string, unknown>) ?? {},
    verification_status: (row.verification_status as string) ?? null,
    verification_summary: (row.verification_summary as string) ?? null,
    failure_code: (row.failure_code as string) ?? null,
    failure_message: (row.failure_message as string) ?? null,
    rollback_status: (row.rollback_status as string) ?? null,
    provider_reference: (row.provider_reference as string) ?? null,
    dry_run: Boolean(row.dry_run),
    shadow: Boolean(row.shadow),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    requested_at: String(row.requested_at),
    started_at: (row.started_at as string) ?? null,
    completed_at: (row.completed_at as string) ?? null,
    created_at: String(row.created_at),
  }
}

export async function createExecutionReceipt(input: {
  toolName: string
  system: ExecutionSystem
  actionClass: ActionClass
  idempotencyKey: string
  status: ReceiptStatus
  policyDecision?: ExecutionDecision | null
  policyReason?: string | null
  estimatedCostUsd?: number
  toolCallId?: string | null
  taskId?: string | null
  adminUserId?: string | null
  targetType?: string | null
  targetId?: string | null
  beforeState?: Record<string, unknown>
  dryRun?: boolean
  shadow?: boolean
  metadata?: Record<string, unknown>
}): Promise<ExecutionReceipt> {
  const now = new Date().toISOString()
  const receipt: ExecutionReceipt = {
    id: randomUUID(),
    action_id: null,
    task_id: input.taskId ?? null,
    decision_id: null,
    tool_call_id: input.toolCallId ?? null,
    admin_user_id: input.adminUserId ?? null,
    system: input.system,
    action_class: input.actionClass,
    tool_name: input.toolName,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    idempotency_key: input.idempotencyKey,
    status: input.status,
    policy_decision: input.policyDecision ?? null,
    policy_reason: input.policyReason ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? 0,
    actual_cost_usd: null,
    before_state: sanitizeState(input.beforeState ?? {}),
    after_state: {},
    verification_status: null,
    verification_summary: null,
    failure_code: null,
    failure_message: null,
    rollback_status: null,
    provider_reference: null,
    dry_run: Boolean(input.dryRun),
    shadow: Boolean(input.shadow),
    metadata: sanitizeState(input.metadata ?? {}),
    requested_at: now,
    started_at: null,
    completed_at: null,
    created_at: now,
  }

  memoryReceipts.set(receipt.id, receipt)
  byIdempotency.set(receipt.idempotency_key, receipt.id)

  try {
    const admin = createAdminClient()
    await admin.from('jarvis_execution_receipts').insert({
      id: receipt.id,
      tool_call_id: receipt.tool_call_id,
      task_id: receipt.task_id,
      admin_user_id: receipt.admin_user_id,
      system: receipt.system,
      action_class: receipt.action_class,
      tool_name: receipt.tool_name,
      target_type: receipt.target_type,
      target_id: receipt.target_id,
      idempotency_key: receipt.idempotency_key,
      status: receipt.status,
      policy_decision: receipt.policy_decision,
      policy_reason: receipt.policy_reason,
      estimated_cost_usd: receipt.estimated_cost_usd,
      before_state: receipt.before_state,
      dry_run: receipt.dry_run,
      shadow: receipt.shadow,
      metadata: receipt.metadata,
      requested_at: receipt.requested_at,
    })
  } catch {
    /* memory only */
  }

  return receipt
}

export async function updateExecutionReceipt(
  id: string,
  patch: Partial<{
    status: ReceiptStatus
    actual_cost_usd: number
    after_state: Record<string, unknown>
    verification_status: string
    verification_summary: string
    failure_code: string
    failure_message: string
    rollback_status: string
    provider_reference: string
    started_at: string
    completed_at: string
    metadata: Record<string, unknown>
  }>
): Promise<ExecutionReceipt | null> {
  const existing = memoryReceipts.get(id)
  if (!existing) {
    // try load
    try {
      const admin = createAdminClient()
      const { data } = await admin.from('jarvis_execution_receipts').select('*').eq('id', id).maybeSingle()
      if (!data) return null
      const loaded = rowToReceipt(data as Record<string, unknown>)
      memoryReceipts.set(id, loaded)
    } catch {
      return null
    }
  }
  const cur = memoryReceipts.get(id)!
  const next: ExecutionReceipt = {
    ...cur,
    ...patch,
    after_state: patch.after_state ? sanitizeState(patch.after_state) : cur.after_state,
    metadata: patch.metadata ? sanitizeState({ ...cur.metadata, ...patch.metadata }) : cur.metadata,
  }
  memoryReceipts.set(id, next)

  try {
    const admin = createAdminClient()
    await admin
      .from('jarvis_execution_receipts')
      .update({
        status: next.status,
        actual_cost_usd: next.actual_cost_usd,
        after_state: next.after_state,
        verification_status: next.verification_status,
        verification_summary: next.verification_summary,
        failure_code: next.failure_code,
        failure_message: next.failure_message,
        rollback_status: next.rollback_status,
        provider_reference: next.provider_reference,
        started_at: next.started_at,
        completed_at: next.completed_at,
        metadata: next.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  } catch {
    /* ignore */
  }

  return next
}

export async function listRecentReceipts(limit = 30): Promise<ExecutionReceipt[]> {
  const mem = [...memoryReceipts.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('jarvis_execution_receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (data?.length) return data.map((r) => rowToReceipt(r as Record<string, unknown>))
  } catch {
    /* memory */
  }
  return mem
}

export async function getExecutionReceipt(id: string): Promise<ExecutionReceipt | null> {
  if (memoryReceipts.has(id)) return memoryReceipts.get(id)!
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('jarvis_execution_receipts').select('*').eq('id', id).maybeSingle()
    if (!data) return null
    return rowToReceipt(data as Record<string, unknown>)
  } catch {
    return null
  }
}
