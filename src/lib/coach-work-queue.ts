import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkQueueTaskType =
  | 'initial_plan'
  | 'checkin_review'
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

  for (const client of clients ?? []) {
    if (!client.plan_delivered) {
      tasks.push({
        id: `plan-${client.id}`,
        type: 'initial_plan',
        title: 'Create Initial Plan',
        subtitle: clientNameById.get(client.id) ?? 'Client',
        href: `/coach/client/${client.id}/generate-plan`,
        clientId: client.id,
        clientName: clientNameById.get(client.id),
        priority: PRIORITY.initial_plan,
        createdAt: client.created_at ?? new Date().toISOString(),
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
      title: 'Review Weekly Check-in',
      subtitle: name,
      href: `/coach/checkin/${checkin.id}`,
      clientId: checkin.client_id,
      clientName: name,
      priority: PRIORITY.checkin_review,
      createdAt: checkin.submitted_at,
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
