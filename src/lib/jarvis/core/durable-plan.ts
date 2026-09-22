/**
 * Durable multi-step plan stored on jarvis_tasks.plan (existing jsonb column).
 * Resumable; does not blindly retry; significant steps stay approval-gated via runTool.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { JarvisRiskClass } from '@/lib/jarvis/types'

export type PlanStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting_for_approval'

export type PlanStatus =
  | 'draft'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused_budget'

export type DurablePlanStep = {
  id: string
  index: number
  label: string
  tool?: string
  input?: Record<string, unknown>
  why: string
  depends_on: string[]
  risk: JarvisRiskClass | 'UNKNOWN'
  status: PlanStepStatus
  result_summary?: string
  error?: string
  started_at?: string
  completed_at?: string
}

export type DurablePlan = {
  version: 1
  objective: string
  status: PlanStatus
  expected_outcome: string
  estimated_cost_usd: number
  approval_required: boolean
  current_step_id: string | null
  steps: DurablePlanStep[]
  tools: string[]
  created_at: string
  updated_at: string
}

export function buildDurablePlanFromToolCalls(input: {
  objective: string
  thinkingSummary: string
  toolCalls: { tool: string; input: Record<string, unknown>; why: string }[]
  estimatedCostUsd?: number
}): DurablePlan {
  const now = new Date().toISOString()
  const steps: DurablePlanStep[] = input.toolCalls.map((call, index) => ({
    id: `step_${index + 1}`,
    index,
    label: call.tool,
    tool: call.tool,
    input: call.input,
    why: call.why,
    depends_on: index === 0 ? [] : [`step_${index}`],
    risk: 'UNKNOWN',
    status: 'pending' as const,
  }))

  return {
    version: 1,
    objective: input.objective.slice(0, 500),
    status: steps.length ? 'running' : 'completed',
    expected_outcome: input.thinkingSummary.slice(0, 500),
    estimated_cost_usd: input.estimatedCostUsd ?? 0,
    approval_required: false,
    current_step_id: steps[0]?.id ?? null,
    steps,
    tools: [...new Set(steps.map((s) => s.tool).filter(Boolean) as string[])],
    created_at: now,
    updated_at: now,
  }
}

export async function persistTaskPlan(taskId: string, plan: DurablePlan): Promise<void> {
  const admin = createAdminClient()
  await admin.from('jarvis_tasks').update({ plan }).eq('id', taskId)
}

export async function updatePlanStep(
  taskId: string,
  stepId: string,
  patch: Partial<DurablePlanStep> & { planStatus?: PlanStatus }
): Promise<DurablePlan | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('jarvis_tasks').select('plan').eq('id', taskId).maybeSingle()
  const plan = data?.plan as DurablePlan | null
  if (!plan || plan.version !== 1) return null

  const steps = plan.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s))
  const next: DurablePlan = {
    ...plan,
    steps,
    status: patch.planStatus ?? plan.status,
    current_step_id: stepId,
    updated_at: new Date().toISOString(),
    approval_required:
      patch.planStatus === 'waiting_for_approval' ? true : plan.approval_required,
  }

  // Advance current pointer to next pending when step completed
  if (patch.status === 'completed') {
    const nextPending = steps.find((s) => s.status === 'pending')
    next.current_step_id = nextPending?.id ?? stepId
    if (!nextPending && !steps.some((s) => s.status === 'waiting_for_approval')) {
      next.status = steps.some((s) => s.status === 'failed') ? 'failed' : 'completed'
    }
  }

  await admin.from('jarvis_tasks').update({ plan: next }).eq('id', taskId)
  return next
}

export function summarizePlanForPrompt(plan: DurablePlan): Record<string, unknown> {
  return {
    objective: plan.objective,
    status: plan.status,
    expected_outcome: plan.expected_outcome,
    current_step_id: plan.current_step_id,
    steps: plan.steps.map((s) => ({
      id: s.id,
      label: s.label,
      tool: s.tool,
      status: s.status,
      why: s.why,
      result_summary: s.result_summary,
      error: s.error,
    })),
  }
}
