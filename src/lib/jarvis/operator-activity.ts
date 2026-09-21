import { createAdminClient } from '@/lib/supabase/admin'
import { activityKindFromSource, humanToolLabel, type ActivityKindUi } from '@/lib/jarvis/operator-present'
import { humanizeJarvisError } from '@/lib/jarvis/operator-errors'

export type JarvisActivityItem = {
  id: string
  at: string
  kind: ActivityKindUi
  title: string
  detail?: string
  link?: string | null
}

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

export async function buildActivityFeed(limit = 60): Promise<JarvisActivityItem[]> {
  const admin = createAdminClient()
  const [
    { data: notifications },
    { data: events },
    { data: tasks },
    { data: toolCalls },
    { data: research },
  ] = await Promise.all([
    admin
      .from('jarvis_notifications')
      .select('id, kind, title, body, link, created_at')
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('jarvis_events')
      .select('id, event_type, status, error, created_at, processed_at')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('jarvis_tasks')
      .select('id, objective, status, error, created_at, completed_at, source')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('jarvis_tool_calls')
      .select('id, tool_name, permission_result, error, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(40),
    admin
      .from('jarvis_research')
      .select('id, question, conclusion, status, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const items: JarvisActivityItem[] = []

  for (const n of notifications ?? []) {
    items.push({
      id: `n-${n.id}`,
      at: n.created_at,
      kind: activityKindFromSource({ notificationKind: n.kind }),
      title: n.title,
      detail: n.body,
      link: n.link,
    })
  }

  for (const ev of events ?? []) {
    items.push({
      id: `e-${ev.id}`,
      at: ev.processed_at || ev.created_at,
      kind: ev.status === 'failed' ? 'ERROR' : activityKindFromSource({ eventType: ev.event_type }),
      title: humanEventTitle(ev.event_type),
      detail: ev.error ? humanizeJarvisError(ev.error) : ev.status === 'processed' ? 'Completed' : ev.status,
    })
  }

  for (const t of tasks ?? []) {
    if (t.source === 'chat' && t.status === 'completed') continue
    items.push({
      id: `t-${t.id}`,
      at: t.completed_at || t.created_at,
      kind: t.status === 'failed' || t.status === 'budget_exhausted' || t.status === 'paused_budget' ? 'ERROR' : 'ACTION',
      title: t.objective.slice(0, 120),
      detail: t.error ? humanizeJarvisError(t.error) : t.status.replace(/_/g, ' '),
    })
  }

  for (const c of toolCalls ?? []) {
    items.push({
      id: `c-${c.id}`,
      at: c.completed_at || c.created_at,
      kind: c.error
        ? 'ERROR'
        : activityKindFromSource({ toolName: c.tool_name }),
      title: humanToolLabel(c.tool_name),
      detail: c.error
        ? humanizeJarvisError(c.error)
        : c.permission_result === 'requires_approval'
          ? 'Waiting for approval'
          : c.permission_result.replace(/_/g, ' '),
    })
  }

  for (const r of research ?? []) {
    items.push({
      id: `r-${r.id}`,
      at: r.completed_at || r.created_at,
      kind: r.status === 'failed' ? 'ERROR' : 'RESEARCH',
      title: r.status === 'completed' ? `Research completed: ${r.question}` : r.question,
      detail: asText(r.conclusion).slice(0, 220),
    })
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return items.slice(0, limit)
}

function humanEventTitle(eventType: string): string {
  switch (eventType) {
    case 'meta.sync_completed':
      return 'Meta campaign sync completed'
    case 'video.uploaded':
      return 'Video uploaded for editing'
    case 'funnel.conversion_drop':
      return 'Funnel conversion drop detected'
    case 'experiment.completed':
      return 'Experiment completed'
    default:
      return eventType.replace(/[._]/g, ' ')
  }
}
