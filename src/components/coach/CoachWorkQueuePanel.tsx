'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
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
import { colors } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'

const supabase = createClient()

const COMPLETED_KEY = 'coach-queue-completed'

const FILTER_LABELS: Record<WorkQueueFilter, string> = {
  all: 'All tasks',
  initial_plan: 'Initial Plans',
  checkin_review: 'Weekly Reviews',
  unread_chat: 'Unread Chats',
  issue_report: 'Issue Reports',
  other: 'Everything Else',
}

function loadCompleted(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(COMPLETED_KEY)
    return new Set(raw ? JSON.parse(raw) as string[] : [])
  } catch {
    return new Set()
  }
}

function saveCompleted(ids: Set<string>) {
  sessionStorage.setItem(COMPLETED_KEY, JSON.stringify([...ids]))
}

type CoachWorkQueuePanelProps = {
  filter?: WorkQueueFilter
  onCountsChange?: (counts: WorkQueueCounts) => void
}

export function CoachWorkQueuePanel({ filter = 'all', onCountsChange }: CoachWorkQueuePanelProps) {
  const router = useRouter()
  const [tasks, setTasks] = useState<WorkQueueTask[]>([])
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setCompleted(loadCompleted())
  }, [])

  useEffect(() => {
    let active = true
    let poll: ReturnType<typeof setInterval> | null = null
    let coachId: string | null = null

    const load = async (reauth: boolean) => {
      if (reauth || !coachId) {
        const coach = await requireCoach(supabase, router)
        if (!coach || !active) {
          setLoading(false)
          return
        }
        coachId = coach.id
      }
      const queue = await getCoachWorkQueue(supabase, coachId)
      if (active) {
        setTasks(queue)
        onCountsChange?.(getWorkQueueCounts(queue))
        setLoading(false)
      }
    }

    void load(true)
    poll = setInterval(() => void load(false), 15000)
    return () => {
      active = false
      if (poll) clearInterval(poll)
    }
  }, [router, onCountsChange])

  const filtered = filterWorkQueue(tasks, filter)
  const visible = filtered.filter((t) => !completed.has(t.id))
  const current = visible[0] ?? null
  const upcoming = visible.slice(1, 4)

  const handleComplete = () => {
    if (!current) return
    const next = new Set(completed)
    next.add(current.id)
    setCompleted(next)
    saveCompleted(next)
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
        onClick={() => router.push(current.href)}
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
        <button type="button" onClick={() => router.push(current.href)} style={primaryBtn}>
          Start
        </button>
        <button type="button" onClick={handleComplete} style={secondaryBtn}>
          Complete
        </button>
      </div>
      {upcoming.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Up next</p>
          {upcoming.map((task) => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${colors.divider}` }}>
              <span style={{ color: colors.textMuted }}>↓</span>
              <button type="button" onClick={() => router.push(task.href)} style={{ background: 'none', border: 'none', padding: 0, color: colors.textSecondary, cursor: 'pointer', fontSize: 14, textAlign: 'left' }}>
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
