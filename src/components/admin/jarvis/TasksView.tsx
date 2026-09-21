'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { formatDateTime, formatUsd, toolFamily } from '@/lib/jarvis/operator-present'
import type { JarvisTask } from './types'
import * as s from './styles'

function statusTone(label: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (label === 'COMPLETED') return 'ok'
  if (label === 'FAILED') return 'danger'
  if (label === 'WAITING_FOR_APPROVAL' || label === 'PAUSED_BUDGET') return 'warn'
  if (label === 'RUNNING') return 'info'
  return 'muted'
}

export function TasksView({
  selectedTaskId,
  onSelect,
}: {
  selectedTaskId: string | null
  onSelect: (id: string | null) => void
}) {
  const [tasks, setTasks] = useState<JarvisTask[]>([])
  const [detail, setDetail] = useState<{
    task: JarvisTask
    timeline: { id: string; at: string; family: string; label: string; status: string; detail: string }[]
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/tasks')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load tasks')
    setTasks(json.tasks ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/jarvis/tasks')
        const json = await res.json()
        if (cancelled) return
        if (!json.success) throw new Error(json.error || 'Failed to load tasks')
        setTasks(json.tasks ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedTaskId) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/admin/jarvis/tasks?taskId=${selectedTaskId}`)
      const json = await res.json()
      if (cancelled) return
      if (json.success) setDetail({ task: json.task, timeline: json.timeline ?? [] })
    })()
    return () => {
      cancelled = true
    }
  }, [selectedTaskId])

  async function cancel(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/jarvis/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: id, action: 'cancel' }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Cancel failed')
      await load()
      onSelect(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed')
    } finally {
      setBusy(false)
    }
  }

  const shown = selectedTaskId && detail?.task.id === selectedTaskId ? detail : null

  if (shown) {
    const t = shown.task
    return (
      <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
        <button type="button" style={{ ...s.ghostBtn, marginBottom: 12 }} onClick={() => onSelect(null)}>
          ← All tasks
        </button>
        <div style={s.eyebrow}>TASK</div>
        <h2 style={{ margin: '6px 0 8px', fontSize: 22 }}>{t.name}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={s.badge(statusTone(t.status_label))}>{t.status_label}</span>
          <span style={s.muted}>{formatDateTime(t.created_at)}</span>
        </div>
        <div style={s.card}>
          <div>Current step: {t.current_step || '—'}</div>
          {t.progress != null ? <div style={s.muted}>Progress {t.progress}%</div> : null}
          <div style={s.muted}>
            Cost {formatUsd(t.actual_cost_usd, 4)} / budget {formatUsd(t.estimated_cost_usd, 2)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {(t.tools ?? []).map((tool) => (
              <span key={tool} style={s.badge('muted')}>
                {toolFamily(tool)}
              </span>
            ))}
          </div>
          {t.result ? <div style={{ marginTop: 10, fontSize: 13 }}>{t.result}</div> : null}
          {t.error ? <div style={{ color: colors.danger, marginTop: 8, fontSize: 13 }}>{t.error}</div> : null}
          {t.cancellable ? (
            <button type="button" style={{ ...s.dangerBtn, marginTop: 12 }} disabled={busy} onClick={() => void cancel(t.id)}>
              Cancel task
            </button>
          ) : null}
        </div>
        <div style={{ ...s.eyebrow, marginTop: 18 }}>TIMELINE</div>
        {shown.timeline.length ? (
          shown.timeline.map((step) => (
            <div key={step.id} style={{ ...s.card, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: colors.textMuted }}>{formatDateTime(step.at)}</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{step.label}</div>
              <div style={s.muted}>{step.detail}</div>
            </div>
          ))
        ) : (
          <div style={s.muted}>No steps recorded yet.</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>TASKS</div>
      <h2 style={{ margin: '6px 0 16px', fontSize: 24 }}>Active work</h2>
      {error ? <div style={{ color: colors.danger, marginBottom: 10 }}>{error}</div> : null}
      {tasks.length ? (
        tasks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            style={{ ...s.card, width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
              <span style={s.badge(statusTone(t.status_label))}>{t.status_label}</span>
            </div>
            <div style={s.muted}>
              {t.current_step} · {formatDateTime(t.created_at)}
              {t.actual_cost_usd != null ? ` · ${formatUsd(t.actual_cost_usd, 4)}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {(t.tools ?? []).slice(0, 4).map((tool) => (
                <span key={tool} style={s.badge('muted')}>
                  {toolFamily(tool)}
                </span>
              ))}
            </div>
          </button>
        ))
      ) : (
        <div style={s.muted}>No tasks yet. Ask Jarvis to investigate, research, or generate work.</div>
      )}
    </div>
  )
}
