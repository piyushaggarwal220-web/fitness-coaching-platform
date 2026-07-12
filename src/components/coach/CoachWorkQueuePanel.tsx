'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { coachPageStyles } from '@/lib/coach-page-styles'
import { getCoachWorkQueue, type WorkQueueTask } from '@/lib/coach-work-queue'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/design-tokens'

const supabase = createClient()

const COMPLETED_KEY = 'coach-queue-completed'

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

export function CoachWorkQueuePanel() {
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

    const load = async () => {
      const coach = await requireCoach(supabase, router)
      if (!coach || !active) { setLoading(false); return }
      const queue = await getCoachWorkQueue(supabase, coach.id)
      if (active) {
        setTasks(queue)
        setLoading(false)
      }
    }

    void load()
    poll = setInterval(() => void load(), 8000)
    return () => { active = false; if (poll) clearInterval(poll) }
  }, [router])

  const visible = tasks.filter((t) => !completed.has(t.id))
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
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: colors.textPrimary }}>All caught up</p>
        <p style={{ margin: '8px 0 0', color: colors.textMuted, fontSize: 14 }}>No pending tasks in your queue.</p>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Next Task
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
