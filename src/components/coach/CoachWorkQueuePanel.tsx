'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
const COMPLETED_MAX = 400

type CompletedEntry = { createdAt: string | null; completedAt: number }
type CompletedMap = Map<string, CompletedEntry>

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

function loadCompleted(): CompletedMap {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = localStorage.getItem(COMPLETED_KEY) ?? sessionStorage.getItem(COMPLETED_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return new Map(
        parsed
          .filter((id): id is string => typeof id === 'string')
          .map((id) => [id, { createdAt: null, completedAt: 0 }])
      )
    }
    if (parsed && typeof parsed === 'object') {
      const entries = Object.entries((parsed as { items?: Record<string, CompletedEntry> }).items ?? {})
      return new Map(
        entries.map(([id, entry]) => [
          id,
          {
            createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : null,
            completedAt: typeof entry?.completedAt === 'number' ? entry.completedAt : 0,
          },
        ])
      )
    }
  } catch {
    return new Map()
  }
  return new Map()
}

function saveCompleted(map: CompletedMap) {
  const entries = [...map.entries()].sort((a, b) => a[1].completedAt - b[1].completedAt)
  const trimmed = entries.length > COMPLETED_MAX ? entries.slice(entries.length - COMPLETED_MAX) : entries
  const payload = JSON.stringify({ v: 2, items: Object.fromEntries(trimmed) })
  try {
    localStorage.setItem(COMPLETED_KEY, payload)
    sessionStorage.setItem(COMPLETED_KEY, payload)
  } catch {
    // Storage can be unavailable; the in-memory map still covers this session.
  }
}

function withTaskCompleted(map: CompletedMap, task: WorkQueueTask): CompletedMap {
  const next = new Map(map)
  next.set(task.id, { createdAt: task.createdAt ?? null, completedAt: Date.now() })
  return next
}

function isTaskCompleted(task: WorkQueueTask, map: CompletedMap): boolean {
  const entry = map.get(task.id)
  if (!entry) return false
  if (!entry.createdAt) return true
  const taskAt = Date.parse(task.createdAt)
  const doneAt = Date.parse(entry.createdAt)
  if (!Number.isFinite(taskAt) || !Number.isFinite(doneAt)) return true
  return taskAt <= doneAt
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
  const [completed, setCompleted] = useState<CompletedMap>(loadCompleted)
  const completedRef = useRef<CompletedMap>(completed)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState('')
  const [coachId, setCoachId] = useState<string | null>(null)

  const applyQueue = useCallback((queue: WorkQueueTask[]) => {
    setTasks(queue)
    const visible = queue.filter((task) => !isTaskCompleted(task, completedRef.current))
    onCountsChange?.(getWorkQueueCounts(visible))
  }, [onCountsChange])

  useEffect(() => {
    completedRef.current = completed
  }, [completed])

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
  const visible = filtered.filter((task) => !isTaskCompleted(task, completed))
  const current = visible[0] ?? null
  const upcoming = visible.slice(1)

  const handleComplete = async (task: WorkQueueTask) => {
    if (completing) return
    setCompleting(true)
    setCompleteError('')
    setCompletingTaskId(task.id)

    const res = await fetch('/api/coach/work-queue/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ task }),
    })
    const result = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null
    if (!res.ok || !result?.ok) {
      setCompleteError(result?.error ?? 'Could not complete this task.')
      setCompleting(false)
      setCompletingTaskId(null)
      return
    }

    const next = withTaskCompleted(completed, task)
    completedRef.current = next
    setCompleted(next)
    saveCompleted(next)
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    onCountsChange?.(getWorkQueueCounts(visible.filter((t) => t.id !== task.id)))
    setCompleting(false)
    setCompletingTaskId(null)

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
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => openTask(current.href)} style={primaryBtn}>
          Start
        </button>
        <button
          type="button"
          onClick={() => void handleComplete(current)}
          disabled={completing}
          style={completeBtn}
        >
          {completingTaskId === current.id ? 'Saving…' : 'Mark complete'}
        </button>
      </div>
      {completeError ? (
        <p style={{ margin: '10px 0 0', color: '#ef4444', fontSize: 13 }}>{completeError}</p>
      ) : null}
      {upcoming.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>
            Up next ({upcoming.length})
          </p>
          {upcoming.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderTop: `1px solid ${colors.divider}`,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: colors.textMuted, flexShrink: 0 }}>↓</span>
              <button
                type="button"
                onClick={() => openTask(task.href)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: colors.textSecondary,
                  cursor: 'pointer',
                  fontSize: 14,
                  textAlign: 'left',
                  flex: '1 1 160px',
                  minWidth: 0,
                }}
              >
                {task.title} — {task.subtitle}
              </button>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={() => openTask(task.href)} style={rowStartBtn}>
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => void handleComplete(task)}
                  disabled={completing}
                  style={rowCompleteBtn}
                >
                  {completingTaskId === task.id ? 'Saving…' : 'Complete'}
                </button>
              </div>
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
  minWidth: 120,
  padding: '12px 16px',
  backgroundColor: colors.accent,
  color: colors.textInverse,
  border: 'none',
  borderRadius: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 15,
}

const completeBtn: CSSProperties = {
  flex: 1,
  minWidth: 140,
  padding: '12px 16px',
  backgroundColor: colors.successMuted,
  color: colors.success,
  border: `1px solid ${colors.success}`,
  borderRadius: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 15,
}

const rowStartBtn: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: colors.accent,
  color: colors.textInverse,
  border: 'none',
  borderRadius: 10,
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
}

const rowCompleteBtn: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: colors.successMuted,
  color: colors.success,
  border: `1px solid ${colors.success}`,
  borderRadius: 10,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}
