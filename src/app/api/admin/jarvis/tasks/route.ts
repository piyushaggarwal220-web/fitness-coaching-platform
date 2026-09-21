import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCancelTask, taskStatusLabel, toolFamily } from '@/lib/jarvis/operator-present'
import { humanizeJarvisError, sanitizePublicJson } from '@/lib/jarvis/operator-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicTask(row: Record<string, unknown>, tools: string[] = []) {
  const result = sanitizePublicJson(row.result) as Record<string, unknown> | null
  const status = String(row.status || '')
  return {
    id: row.id,
    name: row.objective,
    status,
    status_label: taskStatusLabel(status),
    source: row.source,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    current_step: currentStep(status, tools, result),
    progress: progressFor(status, row),
    tools,
    estimated_cost_usd: row.budget_usd ?? null,
    actual_cost_usd: row.spent_usd ?? null,
    result: result && typeof result === 'object' ? summarizeResult(result) : null,
    error: row.error ? humanizeJarvisError(String(row.error)) : null,
    cancellable: canCancelTask(status),
    conversation_id: row.conversation_id,
  }
}

function currentStep(
  status: string,
  tools: string[],
  result: Record<string, unknown> | null
): string {
  if (status === 'queued') return 'Queued'
  if (status === 'awaiting_approval') return 'Waiting for approval'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'budget_exhausted' || status === 'paused_budget') return 'Paused — budget'
  if (status === 'paused') return 'Paused'
  if (tools.length) return `Using ${toolFamily(tools[tools.length - 1]!)}`
  if (result) return 'Finishing'
  return 'Running'
}

function progressFor(status: string, row: Record<string, unknown>): number | null {
  const used = Number(row.tool_calls_used || 0)
  const max = Number(row.max_tool_calls || 0)
  if (status === 'completed') return 100
  if (status === 'failed' || status === 'cancelled') return null
  if (max > 0 && used > 0) return Math.min(95, Math.round((used / max) * 100))
  if (status === 'running') return 35
  if (status === 'queued') return 5
  return null
}

function summarizeResult(result: Record<string, unknown>): string {
  const toolResults = result.toolResults
  if (Array.isArray(toolResults) && toolResults.length) {
    const last = toolResults[toolResults.length - 1] as { summary?: string; tool?: string }
    return last?.summary || `${toolResults.length} steps completed`
  }
  if (typeof result.summary === 'string') return result.summary
  return 'Task finished'
}

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const taskId = url.searchParams.get('taskId')
  const conversationId = url.searchParams.get('conversationId')
  const admin = createAdminClient()

  if (taskId) {
    const { data: task, error } = await admin.from('jarvis_tasks').select('*').eq('id', taskId).maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })

    const { data: calls } = await admin
      .from('jarvis_tool_calls')
      .select('id, tool_name, permission_result, error, created_at, completed_at, duration_ms, actual_cost_usd, risk_class')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })

    const timeline = (calls ?? []).map((c) => ({
      id: c.id,
      at: c.created_at,
      completed_at: c.completed_at,
      family: toolFamily(c.tool_name),
      label: toolFamily(c.tool_name),
      status: c.error ? 'error' : c.permission_result,
      detail: c.error
        ? humanizeJarvisError(c.error)
        : c.permission_result === 'requires_approval'
          ? 'Waiting for approval'
          : c.permission_result === 'executed' || c.permission_result === 'allowed'
            ? 'Completed'
            : c.permission_result.replace(/_/g, ' '),
      duration_ms: c.duration_ms,
      cost_usd: c.actual_cost_usd,
    }))

    return NextResponse.json({
      success: true,
      task: publicTask(
        task,
        (calls ?? []).map((c) => c.tool_name)
      ),
      timeline,
    })
  }

  let q = admin
    .from('jarvis_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(80)
  if (conversationId) q = q.eq('conversation_id', conversationId)

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const ids = (data ?? []).map((t) => t.id)
  const { data: calls } = ids.length
    ? await admin.from('jarvis_tool_calls').select('task_id, tool_name').in('task_id', ids)
    : { data: [] as { task_id: string; tool_name: string }[] }

  const toolsByTask = new Map<string, string[]>()
  for (const c of calls ?? []) {
    const list = toolsByTask.get(c.task_id) ?? []
    if (!list.includes(c.tool_name)) list.push(c.tool_name)
    toolsByTask.set(c.task_id, list)
  }

  return NextResponse.json({
    success: true,
    tasks: (data ?? []).map((t) => publicTask(t, toolsByTask.get(t.id) ?? [])),
  })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    taskId?: string
    action?: 'cancel'
  }
  if (!body.taskId || body.action !== 'cancel') {
    return NextResponse.json({ success: false, error: 'taskId and action=cancel required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: task } = await admin.from('jarvis_tasks').select('id, status').eq('id', body.taskId).maybeSingle()
  if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
  if (!canCancelTask(task.status)) {
    return NextResponse.json(
      { success: false, error: 'This task can no longer be cancelled.' },
      { status: 400 }
    )
  }

  const { error } = await admin
    .from('jarvis_tasks')
    .update({
      status: 'cancelled',
      error: 'Cancelled by operator',
      completed_at: new Date().toISOString(),
    })
    .eq('id', body.taskId)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
