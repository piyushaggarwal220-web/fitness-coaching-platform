'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  filterWorkQueue,
  getCoachWorkQueue,
  getWorkQueueCounts,
  type WorkQueueCounts,
  type WorkQueueFilter,
  type WorkQueueTask,
} from '@/lib/coach-work-queue'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/coach-theme'
import { motionClass } from '@/lib/motion'
import { useCoachConversationRealtime } from '@/hooks/useSupabaseRealtime'

const supabase = createClient()

const COMPLETED_KEY = 'coach-queue-completed'

const FILTER_LABELS: Record<WorkQueueFilter, string> = {
  all: 'All tasks',
  initial_plan: 'Initial Plans',
  plan_change_request: 'Client Edits',
  checkin_review: 'Weekly Reviews',
  call_request: 'Call Requests',
  unread_chat: 'Unread Chats',
  issue_report: 'Issue Reports',
  other: 'Everything Else',
}

function loadCompleted(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(COMPLETED_KEY) ?? sessionStorage.getItem(COMPLETED_KEY)
    return new Set(raw ? JSON.parse(raw) as string[] : [])
  } catch {
    return new Set()
  }
}

function saveCompleted(ids: Set<string>) {
  const payload = JSON.stringify([...ids])
  localStorage.setItem(COMPLETED_KEY, payload)
  sessionStorage.setItem(COMPLETED_KEY, payload)
}

function pruneCompleted(ids: Set<string>, queue: WorkQueueTask[]): Set<string> {
  if (ids.size === 0) return ids
  const openIds = new Set(queue.map((t) => t.id))
  const next = new Set([...ids].filter((id) => openIds.has(id)))
  if (next.size !== ids.size) saveCompleted(next)
  return next
}

/** Keep queue context when opening chat from dashboard or /coach/queue. */
function withQueueReturn(href: string, returnTo: string): string {
  if (!href.startsWith('/coach/chat/')) return href
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}returnTo=${encodeURIComponent(returnTo)}`
}

type CoachWorkQueuePanelProps = {
  filter?: WorkQueueFilter
  onCountsChange?: (counts: WorkQueueCounts) => void
}

export function CoachWorkQueuePanel({ filter = 'all', onCountsChange }: CoachWorkQueuePanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const returnTo = pathname.startsWith('/coach/queue')
    ? '/coach/queue'
    : pathname.startsWith('/coach/dashboard')
      ? '/coach/dashboard'
      : '/coach/queue'
  const openTask = useCallback(
    (href: string) => {
      router.push(withQueueReturn(href, returnTo))
    },
    [router, returnTo]
  )
  const [tasks, setTasks] = useState<WorkQueueTask[]>([])
  const [completed, setCompleted] = useState<Set<string>>(loadCompleted)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [coachId, setCoachId] = useState<string | null>(null)

  const applyQueue = useCallback((queue: WorkQueueTask[]) => {
    setTasks(queue)
    setCompleted((prev) => {
      const pruned = pruneCompleted(prev, queue)
      const visible = queue.filter((t) => !pruned.has(t.id))
      onCountsChange?.(getWorkQueueCounts(visible))
      return pruned
    })
  }, [onCountsChange])

  const load = useCallback(async () => {
    if (!coachId) return
    const queue = await getCoachWorkQueue(supabase, coachId)
    applyQueue(queue)
    setLoading(false)
  }, [coachId, applyQueue])

  useEffect(() => {
    let active = true
    const authorize = async () => {
      const coach = await requireCoach(supabase, router)
      if (!active) return
      if (!coach) {
        setLoading(false)
        return
      }
      setCoachId(coach.id)
      const queue = await getCoachWorkQueue(supabase, coach.id)
      if (!active) return
      applyQueue(queue)
      setLoading(false)
    }
    void authorize()
    return () => { active = false }
  }, [router, applyQueue])

  // Realtime accelerates chat tasks; 20s fallback covers plans/check-ins/profiles.
  useCoachConversationRealtime(coachId, load, 20_000, 'work-queue')

  const filtered = filterWorkQueue(tasks, filter)
  const visible = filtered.filter((t) => !completed.has(t.id))
  const current = visible[0] ?? null
  const upcoming = visible.slice(1, 4)

  const handleComplete = async () => {
    if (!current || completing) return
    setCompleting(true)
    setCompleteError('')

    const res = await fetch('/api/coach/work-queue/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ task: current }),
    })
    const result = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null
    if (!res.ok || !result?.ok) {
      setCompleteError(result?.error ?? 'Could not complete this task.')
      setCompleting(false)
      return
    }

    const next = new Set(completed)
    next.add(current.id)
    setCompleted(next)
    saveCompleted(next)
    setTasks((prev) => prev.filter((t) => t.id !== current.id))
    onCountsChange?.(getWorkQueueCounts(visible.filter((t) => t.id !== current.id)))
    setCompleting(false)

    // Refresh from server so counts stay accurate after DB resolution.
    void load()
  }

  if (loading) {
    return <div className="skeleton" style={{ height: 160, borderRadius: 16 }} />
  }

  if (!current) {
    return (
      <div style={panelStyle}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: colors.textPrimary }}>
          {filter === 'all' ? 'All caught up' : `No ${FILTER_LABELS[filter].toLowerCase()} in queue`}
        </p>
        <p style={{ margin: '8px 0 0', color: colors.textMuted, fontSize: 14 }}>
          {filter === 'all'
            ? 'No pending tasks in your queue.'
            : 'Try another filter or check back later.'}
        </p>
      </div>
    )
  }

  return (
    <div className={motionClass.queueEnter} style={panelStyle} key={current.id}>
      {filter !== 'all' && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: colors.accent, fontWeight: 600 }}>
          Filtered: {FILTER_LABELS[filter]}
        </p>
      )}
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Next up
      </p>
      <button
        type="button"
        onClick={() => openTask(current.href)}
        className="card-hover"
        style={{
          marginTop: 12,
          width: '100%',
          textAlign: 'left',
          padding: 16,
          borderRadius: 16,
          border: `1px solid rgba(249,115,22,0.25)`,
          background: `linear-gradient(135deg, ${colors.accentMuted} 0%, ${colors.bgElevated} 100%)`,
          cursor: 'pointer',
        }}
      >
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>{current.title}</p>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textSecondary }}>{current.subtitle}</p>
      </button>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => openTask(current.href)} style={primaryBtn}>
          Start
        </button>
        {current.type !== 'plan_change_request' ? (
          <button type="button" onClick={() => void handleComplete()} disabled={completing} style={secondaryBtn}>
            {completing ? 'Saving…' : 'Complete'}
          </button>
        ) : null}
      </div>
      {completeError ? (
        <p style={{ margin: '10px 0 0', color: '#ef4444', fontSize: 13 }}>{completeError}</p>
      ) : null}
      {upcoming.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Up next</p>
          {upcoming.map((task) => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${colors.divider}` }}>
              <span style={{ color: colors.textMuted }}>↓</span>
              <button type="button" onClick={() => openTask(task.href)} style={{ background: 'none', border: 'none', padding: 0, color: colors.textSecondary, cursor: 'pointer', fontSize: 14, textAlign: 'left' }}>
                {task.title} — {task.subtitle}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const panelStyle: CSSProperties = {
  backgroundColor: colors.bgCard,
  padding: 20,
  borderRadius: 16,
  border: `1px solid ${colors.borderSubtle}`,
  marginBottom: 16,
}

const primaryBtn: CSSProperties = {
  flex: 1,
  padding: '12px 16px',
  backgroundColor: colors.accent,
  color: colors.textInverse,
  border: 'none',
  borderRadius: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 15,
}

const secondaryBtn: CSSProperties = {
  padding: '12px 16px',
  backgroundColor: colors.bgElevated,
  color: colors.textPrimary,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 15,
}
