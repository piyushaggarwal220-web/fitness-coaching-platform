import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkQueueTaskType =
  | 'initial_plan'
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
  priority: number
  createdAt: string
}

const PRIORITY: Record<WorkQueueTaskType, number> = {
  initial_plan: 1,
  checkin_review: 2,
  call_request: 2,
  unread_chat: 3,
  issue_report: 4,
  other: 5,
}

function sortTasks(tasks: WorkQueueTask[]): WorkQueueTask[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}

export async function getCoachWorkQueue(
  supabase: SupabaseClient,
  coachId: string
): Promise<WorkQueueTask[]> {
  const tasks: WorkQueueTask[] = []

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, name, email, plan_delivered, checkin_awaiting, created_at')
    .eq('coach_id', coachId)

  const clientIds = (clients ?? []).map((c) => c.id)
  const clientNameById = new Map(
    (clients ?? []).map((c) => [c.id, c.name || c.email || 'Client'])
  )
  const { data: generationJobs } = await supabase
    .from('initial_plan_generation_jobs')
    .select('id, client_id, status, draft_plan_id, error_message, queued_at, updated_at')
    .eq('coach_id', coachId)
  const generationByClient = new Map(
    (generationJobs ?? []).map((job) => [job.client_id, job])
  )

  for (const client of clients ?? []) {
    if (!client.plan_delivered) {
      const generation = generationByClient.get(client.id)
      const title =
        generation?.status === 'ready'
          ? 'Ready for coach note/review'
          : generation?.status === 'generating'
            ? 'AI plan is generating'
            : generation?.status === 'queued'
              ? 'AI plan generation queued'
              : generation?.status === 'failed'
                ? 'AI plan generation failed'
                : 'Create Initial Plan'
      const href = generation?.status === 'ready' && generation.draft_plan_id
        ? `/coach/plan/${generation.draft_plan_id}`
        : `/coach/client/${client.id}/generate-plan`
      tasks.push({
        id: `plan-${client.id}`,
        type: 'initial_plan',
        title,
        subtitle: generation?.status === 'failed'
          ? `${clientNameById.get(client.id) ?? 'Client'} · ${generation.error_message ?? 'Retry available'}`
          : clientNameById.get(client.id) ?? 'Client',
        href,
        clientId: client.id,
        clientName: clientNameById.get(client.id),
        priority: PRIORITY.initial_plan,
        createdAt: generation?.queued_at ?? client.created_at ?? new Date().toISOString(),
      })
    }
  }

  const { data: pendingCheckins } = await supabase
    .from('checkins')
    .select('id, client_id, submitted_at, checkin_type, coaching_week')
    .eq('coach_id', coachId)
    .eq('reviewed', false)
    .order('submitted_at', { ascending: true })

  for (const checkin of pendingCheckins ?? []) {
    const name = clientNameById.get(checkin.client_id) ?? 'Client'
    tasks.push({
      id: `checkin-${checkin.id}`,
      type: 'checkin_review',
      title: checkin.checkin_type === 'mid_week' ? 'Review Mid-Week Check-in' : 'Review Weekly Check-in',
      subtitle: name,
      href: `/coach/checkin/${checkin.id}`,
      clientId: checkin.client_id,
      clientName: name,
      priority: PRIORITY.checkin_review,
      createdAt: checkin.submitted_at,
    })
  }

  const { data: callRequests } = await supabase
    .from('call_requests')
    .select('id, conversation_id, client_id, status, requested_at, scheduled_for')
    .eq('coach_id', coachId)
    .in('status', ['requested', 'scheduled'])
    .order('requested_at', { ascending: true })

  for (const request of callRequests ?? []) {
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
      priority: PRIORITY.call_request,
      createdAt: request.requested_at,
    })
  }

  const { data: unreadChats } = await supabase
    .from('coach_conversations')
    .select('id, client_id, unread_by_coach, last_message_at, last_message_preview')
    .eq('coach_id', coachId)
    .gt('unread_by_coach', 0)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: true })

  for (const conv of unreadChats ?? []) {
    const name = clientNameById.get(conv.client_id) ?? 'Client'
    tasks.push({
      id: `chat-${conv.id}`,
      type: 'unread_chat',
      title: `Reply to ${name}`,
      subtitle: conv.last_message_preview ?? 'New message',
      href: `/coach/chat/${conv.id}`,
      clientId: conv.client_id,
      clientName: name,
      priority: PRIORITY.unread_chat,
      createdAt: conv.last_message_at ?? new Date().toISOString(),
    })
  }

  if (clientIds.length > 0) {
    const { data: issues } = await supabase
      .from('issue_reports')
      .select('id, client_id, description, created_at, status')
      .in('client_id', clientIds)
      .in('status', ['open', 'investigating'])
      .order('created_at', { ascending: true })

    for (const issue of issues ?? []) {
      const name = clientNameById.get(issue.client_id) ?? 'Client'
      tasks.push({
        id: `issue-${issue.id}`,
        type: 'issue_report',
        title: 'Issue Report',
        subtitle: `${name}: ${issue.description.slice(0, 60)}`,
        href: `/coach/client/${issue.client_id}`,
        clientId: issue.client_id,
        clientName: name,
        priority: PRIORITY.issue_report,
        createdAt: issue.created_at,
      })
    }
  }

  for (const client of clients ?? []) {
    if (client.plan_delivered && !client.checkin_awaiting) {
      const covered = tasks.some((t) => t.clientId === client.id)
      if (!covered) {
        tasks.push({
          id: `profile-${client.id}`,
          type: 'other',
          title: 'Client follow-up',
          subtitle: clientNameById.get(client.id) ?? 'Client',
          href: `/coach/client/${client.id}`,
          clientId: client.id,
          clientName: clientNameById.get(client.id),
          priority: PRIORITY.other,
          createdAt: client.created_at ?? new Date().toISOString(),
        })
      }
    }
  }

  return sortTasks(tasks)
}

export type WorkQueueFilter = WorkQueueTaskType | 'all'

export type WorkQueueCounts = {
  initial_plan: number
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
