import type { SupabaseClient } from '@supabase/supabase-js'
import { formatGenerationFailureSubtitle, getGenerationFailureGuidance } from '@/lib/generation-failure-guidance'

export type WorkQueueTaskType =
  | 'initial_plan'
  | 'plan_change_request'
  | 'checkin_review'
  | 'call_request'
  | 'unread_chat'
  | 'issue_report'
  | 'other'

export type WorkQueueTask = {
  id: string
  type: WorkQueueTaskType
  title: string
  subtitle: string
  href: string
  clientId?: string
  clientName?: string
  /** @deprecated Queue order is FIFO by createdAt — kept for API compatibility. */
  priority: number
  createdAt: string
  /** Coach-facing next steps when a task needs recovery (e.g. failed AI generation). */
  coachNextSteps?: string[]
}

/** Equal priority for all types — display order is strictly by received time. */
const QUEUE_PRIORITY = 1

type EmptyQueryResult<T> = { data: T[] | null }

function emptyQueryResult<T>(): EmptyQueryResult<T> {
  return { data: [] }
}

/** Oldest received first — messages, check-ins, and plan work share one timeline. */
function sortTasks(tasks: WorkQueueTask[]): WorkQueueTask[] {
  return [...tasks].sort((a, b) => {
    const aTime = Date.parse(a.createdAt)
    const bTime = Date.parse(b.createdAt)
    const safeA = Number.isFinite(aTime) ? aTime : 0
    const safeB = Number.isFinite(bTime) ? bTime : 0
    if (safeA !== safeB) return safeA - safeB
    // Stable tie-break so order does not jump between refreshes.
    return a.id.localeCompare(b.id)
  })
}

export async function getCoachWorkQueue(
  supabase: SupabaseClient,
  coachId: string
): Promise<WorkQueueTask[]> {
  const tasks: WorkQueueTask[] = []

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, name, email, plan_delivered, onboarding_complete, checkin_awaiting, created_at')
    .eq('coach_id', coachId)

  const clientIds = (clients ?? []).map((c) => c.id)
  const clientNameById = new Map(
    (clients ?? []).map((c) => [c.id, c.name || c.email || 'Client'])
  )
  const pendingPlanClientIds = (clients ?? [])
    .filter((c) => !c.plan_delivered && c.onboarding_complete)
    .map((c) => c.id)

  // Fan out independent coach-scoped reads in one round instead of a waterfall.
  const [
    generationJobsResult,
    undeliveredDraftsResult,
    activePlansResult,
    planChangeRequestsResult,
    pendingCheckinsResult,
    callRequestsResult,
    unreadChatsResult,
    issuesResult,
    completedRowsResult,
  ] = await Promise.all([
    pendingPlanClientIds.length > 0
      ? supabase
          .from('initial_plan_generation_jobs')
          .select('id, client_id, status, draft_plan_id, error_code, error_message, queued_at, updated_at')
          .eq('coach_id', coachId)
          .in('client_id', pendingPlanClientIds)
          .in('status', ['queued', 'generating', 'ready', 'failed'])
          .order('updated_at', { ascending: false })
      : Promise.resolve(emptyQueryResult<{
          id: string
          client_id: string
          status: string
          draft_plan_id: string | null
          error_code: string | null
          error_message: string | null
          queued_at: string | null
          updated_at: string | null
        }>()),
    pendingPlanClientIds.length > 0
      ? supabase
          .from('plans')
          .select('id, client_id, created_at')
          .in('client_id', pendingPlanClientIds)
          .is('delivered_at', null)
          .order('created_at', { ascending: false })
      : Promise.resolve(emptyQueryResult<{ id: string; client_id: string; created_at: string }>()),
    // Avoid downloading full plan bodies — only need clients with both sections present.
    pendingPlanClientIds.length > 0
      ? supabase
          .from('plans')
          .select('client_id')
          .in('client_id', pendingPlanClientIds)
          .eq('active', true)
          .not('nutrition_plan', 'is', null)
          .not('workout_plan', 'is', null)
          .neq('nutrition_plan', '')
          .neq('workout_plan', '')
      : Promise.resolve(emptyQueryResult<{ client_id: string }>()),
    supabase
      .from('plan_change_requests')
      .select('id, client_id, status, draft_plan_id, scope, locked_at, draft_ready_at, error_message')
      .eq('coach_id', coachId)
      .in('status', ['generating', 'draft_ready', 'in_review'])
      .order('locked_at', { ascending: true }),
    supabase
      .from('checkins')
      .select('id, client_id, submitted_at, checkin_type, coaching_week')
      .eq('coach_id', coachId)
      .eq('reviewed', false)
      .order('submitted_at', { ascending: true }),
    supabase
      .from('call_requests')
      .select('id, conversation_id, client_id, status, requested_at, scheduled_for')
      .eq('coach_id', coachId)
      .in('status', ['requested', 'scheduled'])
      .order('requested_at', { ascending: true }),
    supabase
      .from('coach_conversations')
      .select('id, client_id, unread_by_coach, last_message_at, last_message_preview')
      .eq('coach_id', coachId)
      .gt('unread_by_coach', 0)
      .neq('status', 'closed')
      .order('last_message_at', { ascending: true }),
    clientIds.length > 0
      ? supabase
          .from('issue_reports')
          .select('id, client_id, description, created_at, status')
          .in('client_id', clientIds)
          .in('status', ['open', 'investigating'])
          .order('created_at', { ascending: true })
      : Promise.resolve(
          emptyQueryResult<{
            id: string
            client_id: string
            description: string
            created_at: string
            status: string
          }>()
        ),
    supabase
      .from('coach_work_queue_completions')
      .select('task_id, task_created_at')
      .eq('coach_id', coachId),
  ])

  const generationByClient = new Map<
    string,
    {
      id: string
      client_id: string
      status: string
      draft_plan_id: string | null
      error_code: string | null
      error_message: string | null
      queued_at: string | null
      updated_at: string | null
    }
  >()
  for (const job of generationJobsResult.data ?? []) {
    if (!generationByClient.has(job.client_id)) {
      generationByClient.set(job.client_id, job)
    }
  }

  const latestDraftByClient = new Map<string, { id: string; created_at: string }>()
  for (const draft of undeliveredDraftsResult.data ?? []) {
    if (!latestDraftByClient.has(draft.client_id)) {
      latestDraftByClient.set(draft.client_id, { id: draft.id, created_at: draft.created_at })
    }
  }

  const activePlanReadyByClient = new Set(
    (activePlansResult.data ?? []).map((plan) => plan.client_id)
  )

  for (const client of clients ?? []) {
    // Only surface plan work after onboarding completion is persisted.
    // Incomplete clients never reach the dashboard, so they are not queue work.
    if (client.plan_delivered || !client.onboarding_complete) continue
    // Content is authoritative: diet + workout on the active plan means the queue item is done.
    if (activePlanReadyByClient.has(client.id)) continue

    const generation = generationByClient.get(client.id)
    const draft = latestDraftByClient.get(client.id)
    const clientName = clientNameById.get(client.id) ?? 'Client'
    const readyDraftId =
      (generation?.status === 'ready' && generation.draft_plan_id) || draft?.id || null
    const title =
      generation?.status === 'ready' || readyDraftId
        ? 'Ready for coach note/review'
        : generation?.status === 'failed'
          ? 'AI plan generation failed'
          : 'AI plan is generating'
    const href = readyDraftId
      ? `/coach/plan/${readyDraftId}`
      : generation?.status === 'failed'
        ? `/coach/client/${client.id}/generate-plan`
        : `/coach/client/${client.id}`
    const failedGuidance =
      generation?.status === 'failed'
        ? getGenerationFailureGuidance(generation.error_code, generation.error_message)
        : null
    tasks.push({
      id: `plan-${client.id}`,
      type: 'initial_plan',
      title,
      subtitle: failedGuidance
        ? formatGenerationFailureSubtitle(clientName, generation?.error_code, generation?.error_message)
        : clientName,
      href,
      clientId: client.id,
      clientName,
      priority: QUEUE_PRIORITY,
      createdAt: generation?.queued_at ?? draft?.created_at ?? client.created_at ?? new Date().toISOString(),
      coachNextSteps: failedGuidance?.nextSteps,
    })
  }

  for (const change of planChangeRequestsResult.data ?? []) {
    const name = clientNameById.get(change.client_id) ?? 'Client'
    const ready = change.status === 'draft_ready' || change.status === 'in_review'
    tasks.push({
      id: `plan-change-${change.id}`,
      type: 'plan_change_request',
      title: ready
        ? 'Client plan change ready for review'
        : change.status === 'generating'
          ? 'Client plan change generating'
          : 'Client plan change request',
      subtitle: `${name} · ${change.scope}${change.error_message ? ` · ${change.error_message}` : ''}`,
      href: change.draft_plan_id
        ? `/coach/plan/${change.draft_plan_id}`
        : `/coach/client/${change.client_id}`,
      clientId: change.client_id,
      clientName: name,
      priority: QUEUE_PRIORITY,
      createdAt: change.locked_at ?? change.draft_ready_at ?? new Date().toISOString(),
    })
  }

  for (const checkin of pendingCheckinsResult.data ?? []) {
    const name = clientNameById.get(checkin.client_id) ?? 'Client'
    tasks.push({
      id: `checkin-${checkin.id}`,
      type: 'checkin_review',
      title: checkin.checkin_type === 'mid_week' ? 'Reply to Mid-Week Check-in' : 'Review Weekly Check-in',
      subtitle: name,
      href: checkin.checkin_type === 'mid_week'
        ? `/coach/chat?clientId=${checkin.client_id}&checkinId=${checkin.id}`
        : `/coach/checkin/${checkin.id}`,
      clientId: checkin.client_id,
      clientName: name,
      priority: QUEUE_PRIORITY,
      createdAt: checkin.submitted_at,
    })
  }

  for (const request of callRequestsResult.data ?? []) {
    const name = clientNameById.get(request.client_id) ?? 'Client'
    tasks.push({
      id: `call-${request.id}`,
      type: 'call_request',
      title: request.status === 'scheduled' ? `Scheduled call with ${name}` : `Call requested by ${name}`,
      subtitle: request.scheduled_for
        ? new Date(request.scheduled_for).toLocaleString('en-IN')
        : 'Open chat to schedule or resolve',
      href: `/coach/chat/${request.conversation_id}`,
      clientId: request.client_id,
      clientName: name,
      priority: QUEUE_PRIORITY,
      createdAt: request.requested_at,
    })
  }

  for (const conv of unreadChatsResult.data ?? []) {
    const name = clientNameById.get(conv.client_id) ?? 'Client'
    tasks.push({
      id: `chat-${conv.id}`,
      type: 'unread_chat',
      title: `Reply to ${name}`,
      subtitle: conv.last_message_preview ?? 'New message',
      href: `/coach/chat/${conv.id}`,
      clientId: conv.client_id,
      clientName: name,
      priority: QUEUE_PRIORITY,
      createdAt: conv.last_message_at ?? new Date().toISOString(),
    })
  }

  for (const issue of issuesResult.data ?? []) {
    const name = clientNameById.get(issue.client_id) ?? 'Client'
    tasks.push({
      id: `issue-${issue.id}`,
      type: 'issue_report',
      title: 'Issue Report',
      subtitle: `${name}: ${issue.description.slice(0, 60)}`,
      href: `/coach/client/${issue.client_id}`,
      clientId: issue.client_id,
      clientName: name,
      priority: QUEUE_PRIORITY,
      createdAt: issue.created_at,
    })
  }

  const completionByTaskId = new Map(
    (completedRowsResult.data ?? []).map((row) => [
      row.task_id as string,
      row.task_created_at as string | null,
    ])
  )
  return sortTasks(tasks.filter((task) => {
    if (!completionByTaskId.has(task.id)) return true
    const completedSourceAt = completionByTaskId.get(task.id)
    if (!completedSourceAt) return false
    const taskAt = Date.parse(task.createdAt)
    const completedAt = Date.parse(completedSourceAt)
    return Number.isFinite(taskAt) && Number.isFinite(completedAt) && taskAt > completedAt
  }))
}

export type WorkQueueFilter = WorkQueueTaskType | 'all'

export type WorkQueueCounts = {
  initial_plan: number
  plan_change_request: number
  checkin_review: number
  call_request: number
  unread_chat: number
  issue_report: number
  other: number
  total: number
}

export function getWorkQueueCounts(tasks: WorkQueueTask[]): WorkQueueCounts {
  const counts: WorkQueueCounts = {
    initial_plan: 0,
    plan_change_request: 0,
    checkin_review: 0,
    call_request: 0,
    unread_chat: 0,
    issue_report: 0,
    other: 0,
    total: tasks.length,
  }
  for (const task of tasks) {
    counts[task.type] += 1
  }
  return counts
}

export function filterWorkQueue(tasks: WorkQueueTask[], filter: WorkQueueFilter): WorkQueueTask[] {
  if (filter === 'all') return tasks
  return tasks.filter((t) => t.type === filter)
}
