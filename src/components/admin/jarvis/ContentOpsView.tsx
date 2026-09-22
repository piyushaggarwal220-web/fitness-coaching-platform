'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import * as s from './styles'
import { PIPELINE_COLUMNS, type ContentOpsState, type PipelineColumn } from '@/lib/jarvis/content-ops/types'
import { canTransition, statesForPipelineColumn } from '@/lib/jarvis/content-ops/state-machine'

type QueueItem = {
  content_id: string
  title: string
  status: ContentOpsState
  next_action_label: string
  blocking_reason: string | null
  pillar: string | null
  format: string | null
  scheduled_time: string | null
  priority: number
}

type Payload = {
  summary: {
    today_content: number
    needs_attention: number
    scheduled: number
    publishing: number
    published: number
    measuring: number
  }
  by_column: Record<PipelineColumn, QueueItem[]>
  needs_attention: QueueItem[]
  brief: { text: string; meaningful: boolean }
  blocked: { id: string; reason: string; state: string }[]
  calendar: {
    content_id: string
    title: string
    scheduled_local: string
    status: string
    format: string
  }[]
  live_publishing_enabled: boolean
  timezone: string
}

export function ContentOpsView({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/content-ops')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load')
    setData(json as Payload)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await load()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  async function dropOnColumn(column: PipelineColumn) {
    if (!dragId || !data) return
    const item =
      data.needs_attention.find((i) => i.content_id === dragId) ||
      Object.values(data.by_column)
        .flat()
        .find((i) => i.content_id === dragId)
    if (!item) return

    const targets = statesForPipelineColumn(column)
    const to = targets[0]
    if (!to || !canTransition(item.status, to)) {
      setError(`Invalid move: ${item.status} → ${column}`)
      setDragId(null)
      return
    }

    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/jarvis/content-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transition',
          contentId: item.content_id,
          to,
          reason: `pipeline_column:${column}`,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Transition failed')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed')
    } finally {
      setBusy(false)
      setDragId(null)
    }
  }

  const summary = data?.summary

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>PHASE 9 · CONTENT OPERATIONS</div>
      <h2 style={{ margin: '6px 0 8px', fontSize: 24 }}>Content Operations</h2>
      <p style={{ margin: 0, color: colors.textSecondary, fontSize: 13, maxWidth: 760 }}>
        Pipeline orchestration on existing creative, editor, and Instagram systems. Publishing stays
        approval-gated. Times in {data?.timezone ?? 'Asia/Kolkata'}. Live publish:{' '}
        {data?.live_publishing_enabled ? 'ENABLED' : 'DISABLED (honest — no fake published).'}
      </p>
      {error ? <div style={{ color: colors.danger, marginTop: 10 }}>{error}</div> : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 10,
          marginTop: 16,
        }}
      >
        {[
          ['Today', summary?.today_content],
          ['Needs attention', summary?.needs_attention],
          ['Scheduled', summary?.scheduled],
          ['Publishing', summary?.publishing],
          ['Published', summary?.published],
          ['Measuring', summary?.measuring],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ ...s.card, padding: 12 }}>
            <div style={{ fontSize: 11, color: colors.textSecondary }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{value ?? '—'}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginTop: 18 }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 1100 }}>
            {PIPELINE_COLUMNS.map((col) => (
              <div
                key={col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void dropOnColumn(col)}
                style={{
                  ...s.card,
                  width: 150,
                  minHeight: 280,
                  padding: 10,
                  opacity: busy ? 0.7 : 1,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{col}</div>
                {(data?.by_column?.[col] ?? []).map((item) => (
                  <div
                    key={item.content_id}
                    draggable
                    onDragStart={() => setDragId(item.content_id)}
                    onClick={() => setSelected(item)}
                    style={{
                      border: `1px solid ${colors.borderSubtle}`,
                      borderRadius: 8,
                      padding: 8,
                      marginBottom: 8,
                      cursor: 'grab',
                      background: selected?.content_id === item.content_id ? '#fff7f0' : '#fff',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>
                      {item.next_action_label}
                    </div>
                    {item.blocking_reason ? (
                      <div style={{ fontSize: 10, color: colors.danger, marginTop: 4 }}>
                        {item.blocking_reason}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...s.card, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Today&apos;s brief</div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 11,
                marginTop: 8,
                color: colors.textSecondary,
              }}
            >
              {data?.brief?.text || 'Loading…'}
            </pre>
          </div>
          <div style={{ ...s.card, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Upcoming</div>
            {(data?.calendar ?? []).slice(0, 6).map((c) => (
              <div key={c.content_id} style={{ fontSize: 11, marginTop: 6 }}>
                {c.scheduled_local} · {c.title}
              </div>
            ))}
            {(data?.calendar ?? []).length === 0 ? (
              <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 6 }}>
                No scheduled posts in view.
              </div>
            ) : null}
          </div>
          <div style={{ ...s.card, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Blocked</div>
            {(data?.blocked ?? []).slice(0, 6).map((b) => (
              <div key={b.id} style={{ fontSize: 11, marginTop: 6, color: colors.danger }}>
                {b.state}: {b.reason}
              </div>
            ))}
            {(data?.blocked ?? []).length === 0 ? (
              <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 6 }}>
                No blockers.
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'What do I need to do today?',
              'What is blocking my content pipeline?',
              'Schedule next week\'s content',
              'Create next week\'s content batch',
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                style={s.ghostBtn}
                onClick={() => onAsk(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selected ? (
        <div style={{ ...s.card, padding: 14, marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.title}</div>
          <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
            Status {selected.status} · {selected.format} · {selected.pillar || 'no pillar'} ·
            priority {selected.priority}
          </div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Next: {selected.next_action_label}</div>
          {selected.blocking_reason ? (
            <div style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>
              Blocker: {selected.blocking_reason}
            </div>
          ) : null}
          <button
            type="button"
            style={{ ...s.solidBtn, marginTop: 10 }}
            onClick={() =>
              onAsk(`Show provenance and publish package for content ${selected.content_id}`)
            }
          >
            Ask Jarvis for full provenance
          </button>
        </div>
      ) : null}
    </div>
  )
}
