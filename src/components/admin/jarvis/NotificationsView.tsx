'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { formatDateTime } from '@/lib/jarvis/operator-present'
import type { NotificationRow } from './types'
import * as s from './styles'

function tone(category?: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (category === 'ERROR' || category === 'BUDGET WARNING') return 'danger'
  if (category === 'APPROVAL NEEDED') return 'warn'
  if (category === 'TASK COMPLETE' || category === 'RESEARCH FINDING') return 'ok'
  if (category === 'IMPORTANT CHANGE') return 'info'
  return 'muted'
}

export function NotificationsView() {
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/notifications')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed')
    setRows(json.notifications ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/jarvis/notifications')
        const json = await res.json()
        if (cancelled) return
        if (!json.success) throw new Error(json.error || 'Failed')
        setRows(json.notifications ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function mark(id?: string, readAll = false) {
    await fetch('/api/admin/jarvis/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readAll ? { readAll: true } : { id }),
    })
    await load()
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={s.eyebrow}>ALERTS</div>
          <h2 style={{ margin: '6px 0 0', fontSize: 24 }}>Notification center</h2>
        </div>
        <button type="button" style={s.ghostBtn} onClick={() => void mark(undefined, true)}>
          Mark all read
        </button>
      </div>
      {error ? <div style={{ color: colors.danger, marginTop: 10 }}>{error}</div> : null}
      <div style={{ marginTop: 16 }}>
        {rows.length ? (
          rows.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void mark(n.id)}
              style={{
                ...s.card,
                width: '100%',
                textAlign: 'left',
                marginBottom: 8,
                opacity: n.read_at ? 0.65 : 1,
                cursor: 'pointer',
              }}
            >
              <span style={s.badge(tone(n.category))}>{n.category || n.kind}</span>
              <div style={{ fontWeight: 700, marginTop: 6 }}>{n.title}</div>
              <div style={{ fontSize: 13, color: colors.textSecondary }}>{n.body}</div>
              <div style={s.muted}>{formatDateTime(n.created_at)}</div>
            </button>
          ))
        ) : (
          <div style={s.muted}>No notifications.</div>
        )}
      </div>
    </div>
  )
}
