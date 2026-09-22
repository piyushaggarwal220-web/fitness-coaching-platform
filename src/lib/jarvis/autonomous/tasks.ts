/**
 * Proactive durable task creation — fingerprint-deduped.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { persistTaskPlan, type DurablePlan } from '@/lib/jarvis/core/durable-plan'
import type { AttentionItem } from '@/lib/jarvis/autonomous/types'

function makePlan(objective: string, attention: AttentionItem): DurablePlan {
  const now = new Date().toISOString()
  const steps = [
    {
      id: 'step_1',
      index: 0,
      label: 'Observe evidence',
      why: attention.observation,
      depends_on: [] as string[],
      risk: 'READ' as const,
      status: 'completed' as const,
      result_summary: attention.observation,
    },
    {
      id: 'step_2',
      index: 1,
      label: 'Investigate across relevant systems',
      why: 'Targeted cross-system investigation',
      depends_on: ['step_1'],
      risk: 'READ' as const,
      status: 'running' as const,
    },
    {
      id: 'step_3',
      index: 2,
      label: 'Diagnose (OBSERVED / INFERRED / UNCERTAIN / RECOMMENDATION)',
      why: 'Evidence-separated diagnosis',
      depends_on: ['step_2'],
      risk: 'READ' as const,
      status: 'pending' as const,
    },
    {
      id: 'step_4',
      index: 3,
      label: 'Propose recommendation / approval if significant',
      why: 'Significant actions remain approval-gated',
      depends_on: ['step_3'],
      risk: 'SIGNIFICANT' as const,
      status: 'pending' as const,
    },
  ]
  return {
    version: 1,
    objective,
    status: 'running',
    expected_outcome: 'Evidence-backed diagnosis and optional approval-ready recommendation.',
    estimated_cost_usd: 0.15,
    approval_required: attention.requires_approval,
    current_step_id: 'step_2',
    steps,
    tools: [],
    created_at: now,
    updated_at: now,
  }
}

export async function ensureProactiveTask(input: {
  attention: AttentionItem
  actorId?: string | null
}): Promise<{ task_id: string | null; created: boolean; note: string }> {
  const admin = createAdminClient()
  const objective = `Investigate: ${input.attention.title}`.slice(0, 500)

  const { data: existingRows } = await admin
    .from('jarvis_tasks')
    .select('id, status, result')
    .eq('source', 'system')
    .in('status', ['queued', 'running', 'awaiting_approval'])
    .order('created_at', { ascending: false })
    .limit(40)

  const existing = (existingRows ?? []).find(
    (r) =>
      r.result &&
      typeof r.result === 'object' &&
      (r.result as { fingerprint?: string }).fingerprint === input.attention.fingerprint
  )
  if (existing?.id) {
    return {
      task_id: existing.id as string,
      created: false,
      note: 'Existing proactive task reused (deduped by fingerprint).',
    }
  }

  const { data: att } = await admin
    .from('jarvis_attention_items')
    .select('task_id')
    .eq('fingerprint', input.attention.fingerprint)
    .not('task_id', 'is', null)
    .maybeSingle()
  if (att?.task_id) {
    return {
      task_id: att.task_id as string,
      created: false,
      note: 'Attention item already linked to task.',
    }
  }

  const plan = makePlan(objective, input.attention)
  const { data, error } = await admin
    .from('jarvis_tasks')
    .insert({
      objective,
      status: 'running',
      source: 'system',
      plan,
      result: {
        fingerprint: input.attention.fingerprint,
        severity: input.attention.severity,
        system: input.attention.system,
        proactive: true,
      },
      created_by: input.actorId ?? null,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  if (error || !data?.id) {
    return { task_id: null, created: false, note: error?.message ?? 'task_insert_failed' }
  }

  try {
    await persistTaskPlan(data.id as string, plan)
  } catch {
    /* already in insert */
  }

  try {
    await admin
      .from('jarvis_attention_items')
      .update({
        task_id: data.id,
        status: 'investigating',
        updated_at: new Date().toISOString(),
      })
      .eq('fingerprint', input.attention.fingerprint)
  } catch {
    /* optional */
  }

  return { task_id: data.id as string, created: true, note: 'Proactive task created.' }
}

export function buildTakeCarePlan(issue: string): DurablePlan {
  const now = new Date().toISOString()
  const labels = [
    'Understand the issue',
    'Create multi-step plan',
    'Execute allowed low-risk actions',
    'Request approval for significant actions',
    'Verify after writes',
    'Schedule outcome measurement',
    'Report completion',
  ]
  const steps = labels.map((label, index) => ({
    id: `step_${index + 1}`,
    index,
    label,
    why:
      index === 3
        ? '"Take care of it" does not bypass SIGNIFICANT approval requirements.'
        : label,
    depends_on: index === 0 ? [] : [`step_${index}`],
    risk: (index === 3 ? 'SIGNIFICANT' : index >= 2 ? 'LOW_RISK' : 'READ') as
      | 'READ'
      | 'LOW_RISK'
      | 'SIGNIFICANT',
    status: 'pending' as const,
  }))
  return {
    version: 1,
    objective: `Take care of: ${issue.slice(0, 160)}`,
    status: 'draft',
    expected_outcome: 'Issue handled within autonomy/cost/approval bounds; verified where possible.',
    estimated_cost_usd: 0.25,
    approval_required: true,
    current_step_id: steps[0]?.id ?? null,
    steps,
    tools: [],
    created_at: now,
    updated_at: now,
  }
}
