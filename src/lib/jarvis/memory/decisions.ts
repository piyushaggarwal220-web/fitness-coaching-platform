/**
 * Decision ledger — durable DECISION → ACTION linkage.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { remember } from '@/lib/jarvis/memory/business-memory'
import {
  defaultWindowForTool,
  type MeasurementWindowHours,
  type MemoryScope,
} from '@/lib/jarvis/memory/scopes'
import type { MetricExpectation } from '@/lib/jarvis/memory/comparison'

export type DecisionRecord = {
  id: string
  objective: string
  system: string
  scope: string
  scope_id: string | null
  reason: string
  evidence: unknown
  expected_outcome: unknown
  baseline: unknown
  baseline_source: string | null
  measurement_window_hours: number
  success_criteria: unknown
  risk: string
  approval_required: boolean
  approval_status: string
  action_status: string
  source: string
  tool_name: string | null
  action_input: unknown
  action_result: unknown
  verification_state: string | null
  created_at: string
}

export async function recordDecision(input: {
  objective: string
  system: string
  scope?: MemoryScope
  scopeId?: string | null
  reason: string
  evidence?: string[]
  expectedOutcome: {
    metrics: MetricExpectation[]
    qualitative?: string
  }
  baseline: Record<string, unknown>
  baselineSource: string
  measurementWindowHours?: MeasurementWindowHours
  successCriteria?: Record<string, unknown>
  risk?: 'low' | 'medium' | 'high' | 'critical'
  approvalRequired?: boolean
  approvalStatus?: string
  source?: 'JARVIS' | 'USER_DIRECTED' | 'SYSTEM_AUTOMATION'
  toolName?: string | null
  actionInput?: Record<string, unknown>
  relatedApprovalId?: string | null
  relatedTaskId?: string | null
  relatedToolCallId?: string | null
  actorId?: string | null
}): Promise<{ ok: true; decision: DecisionRecord } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const windowHours =
    input.measurementWindowHours ??
    (input.toolName ? defaultWindowForTool(input.toolName) : 48)

  const { data, error } = await admin
    .from('jarvis_decisions')
    .insert({
      objective: input.objective.slice(0, 1000),
      system: input.system,
      scope: input.scope ?? 'GLOBAL_BUSINESS',
      scope_id: input.scopeId ?? null,
      reason: input.reason.slice(0, 2000),
      evidence: input.evidence ?? [],
      expected_outcome: input.expectedOutcome,
      baseline: input.baseline,
      baseline_source: input.baselineSource,
      measurement_window_hours: windowHours,
      success_criteria: input.successCriteria ?? {},
      risk: input.risk ?? 'medium',
      approval_required: input.approvalRequired ?? true,
      approval_status: input.approvalStatus ?? (input.approvalRequired === false ? 'not_required' : 'pending'),
      action_status: 'planned',
      source: input.source ?? 'JARVIS',
      tool_name: input.toolName ?? null,
      action_input: input.actionInput ?? {},
      related_approval_id: input.relatedApprovalId ?? null,
      related_task_id: input.relatedTaskId ?? null,
      related_tool_call_id: input.relatedToolCallId ?? null,
      created_by: input.actorId ?? null,
    })
    .select('*')
    .maybeSingle()

  if (error || !data) {
    return { ok: false, error: error?.message || 'Failed to record decision' }
  }

  // Mirror as memory DECISION (durable, searchable)
  const mem = await remember({
    category: 'decision',
    kind: 'DECISION',
    title: `Decision: ${input.objective.slice(0, 80)}`,
    summary: `${input.reason} Expected: ${input.expectedOutcome.qualitative || JSON.stringify(input.expectedOutcome.metrics).slice(0, 200)}`,
    source: 'jarvis.decision_ledger',
    confidence: 'medium',
    tags: ['decision', input.system, input.scope ?? 'GLOBAL_BUSINESS'],
    actorId: input.actorId,
    evidence: input.evidence ?? [`decision:${data.id}`],
    details: {
      memory_kind: 'DECISION',
      decision_id: data.id,
      scope: input.scope ?? 'GLOBAL_BUSINESS',
      scope_id: input.scopeId ?? null,
      baseline: input.baseline,
      expected_outcome: input.expectedOutcome,
      measurement_window_hours: windowHours,
    },
  }).catch(() => null)

  if (mem?.id) {
    await admin
      .from('jarvis_decisions')
      .update({ related_memory_id: mem.id, updated_at: new Date().toISOString() })
      .eq('id', data.id)
  }

  return { ok: true, decision: data as DecisionRecord }
}

export async function linkActionToDecision(input: {
  decisionId: string
  actionStatus:
    | 'waiting_for_approval'
    | 'approved'
    | 'executed'
    | 'verified'
    | 'failed'
    | 'blocked'
    | 'cancelled'
    | 'recorded_not_executed'
  actionResult?: Record<string, unknown>
  verificationState?: string | null
  relatedToolCallId?: string | null
  relatedApprovalId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const patch: Record<string, unknown> = {
    action_status: input.actionStatus,
    updated_at: new Date().toISOString(),
  }
  if (input.actionResult) patch.action_result = input.actionResult
  if (input.verificationState != null) patch.verification_state = input.verificationState
  if (input.relatedToolCallId) patch.related_tool_call_id = input.relatedToolCallId
  if (input.relatedApprovalId) patch.related_approval_id = input.relatedApprovalId

  const { error } = await admin.from('jarvis_decisions').update(patch).eq('id', input.decisionId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getDecision(id: string): Promise<DecisionRecord | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_decisions').select('*').eq('id', id).maybeSingle()
  return (data as DecisionRecord) ?? null
}

export async function listRecentDecisions(limit = 20): Promise<DecisionRecord[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_decisions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as DecisionRecord[]) ?? []
}

export async function listDecisionsAwaitingMeasurement(limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_outcome_measurements')
    .select('id, decision_id, status, due_at, outcome_state, jarvis_decisions(objective, action_status)')
    .in('status', ['scheduled', 'due'])
    .order('due_at', { ascending: true })
    .limit(limit)
  return data ?? []
}
