'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import {
  MEMORY_CATEGORIES,
  MEMORY_GROUP_ORDER,
  memoryGroup,
  type MemoryUiGroup,
} from '@/lib/jarvis/operator-present'
import type { MemoryRow } from './types'
import * as s from './styles'

const GROUP_DEFAULT_CATEGORY: Record<MemoryUiGroup, (typeof MEMORY_CATEGORIES)[number]> = {
  'BUSINESS FACTS': 'funnel_economics',
  DECISIONS: 'decision',
  PREFERENCES: 'preference',
  RULES: 'business_rule',
  LEARNINGS: 'outcome',
  HYPOTHESES: 'insight',
  'RESEARCH FINDINGS': 'research',
}

export function MemoryView() {
  const [rows, setRows] = useState<MemoryRow[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({
    title: '',
    summary: '',
    category: 'business_rule' as (typeof MEMORY_CATEGORIES)[number],
  })
  const [editing, setEditing] = useState<MemoryRow | null>(null)

  const load = useCallback(async (query = '') => {
    const res = await fetch(`/api/admin/jarvis/memory?q=${encodeURIComponent(query)}`)
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load memory')
    setRows(json.memory ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/jarvis/memory')
        const json = await res.json()
        if (cancelled) return
        if (!json.success) throw new Error(json.error || 'Failed to load memory')
        setRows(json.memory ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<MemoryUiGroup, MemoryRow[]>()
    for (const g of MEMORY_GROUP_ORDER) map.set(g, [])
    for (const row of rows) {
      const g = (row.group as MemoryUiGroup) || memoryGroup(row.category)
      map.get(g)?.push(row)
    }
    return map
  }, [rows])

  async function addMemory() {
    if (!draft.title.trim() || !draft.summary.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/jarvis/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Save failed')
      setDraft({ title: '', summary: '', category: draft.category })
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/jarvis/memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          title: editing.title,
          summary: editing.summary,
          category: editing.category,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Update failed')
      setEditing(null)
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function forget(id: string) {
    if (!confirm('Forget this memory?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/jarvis/memory?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Forget failed')
      await load(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Forget failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>MEMORY</div>
      <h2 style={{ margin: '6px 0 8px', fontSize: 24 }}>Business memory</h2>
      <p style={{ ...s.muted, marginBottom: 14 }}>
        Separate from chat history. Facts, rules, and decisions Jarvis should keep.
      </p>
      {error ? <div style={{ color: colors.danger, marginBottom: 10 }}>{error}</div> : null}

      <input
        style={{ ...s.input, marginBottom: 14 }}
        placeholder="Search memory"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          void load(e.target.value)
        }}
      />

      <div style={{ ...s.card, marginBottom: 18 }}>
        <div style={s.eyebrow}>ADD MEMORY</div>
        <input
          style={{ ...s.input, marginTop: 8 }}
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <textarea
          style={{ ...s.textarea, marginTop: 8, minHeight: 72 }}
          placeholder="Summary"
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
        />
        <select
          style={{ ...s.input, marginTop: 8 }}
          value={draft.category}
          onChange={(e) =>
            setDraft({ ...draft, category: e.target.value as (typeof MEMORY_CATEGORIES)[number] })
          }
        >
          {MEMORY_GROUP_ORDER.map((g) => (
            <option key={g} value={GROUP_DEFAULT_CATEGORY[g]}>
              {g}
            </option>
          ))}
        </select>
        <button type="button" style={{ ...s.primaryBtn, marginTop: 10 }} disabled={busy} onClick={() => void addMemory()}>
          Save memory
        </button>
      </div>

      {MEMORY_GROUP_ORDER.map((group) => {
        const list = grouped.get(group) ?? []
        return (
          <section key={group} style={{ marginBottom: 18 }}>
            <div style={s.eyebrow}>{group}</div>
            {list.length ? (
              list.map((m) => (
                <div key={m.id} style={{ ...s.card, marginTop: 8 }}>
                  {editing?.id === m.id ? (
                    <>
                      <input
                        style={s.input}
                        value={editing.title}
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      />
                      <textarea
                        style={{ ...s.textarea, marginTop: 8, minHeight: 72 }}
                        value={editing.summary}
                        onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button type="button" style={s.primaryBtn} disabled={busy} onClick={() => void saveEdit()}>
                          Save
                        </button>
                        <button type="button" style={s.ghostBtn} onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 700 }}>{m.title}</div>
                      <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>{m.summary}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button type="button" style={s.ghostBtn} onClick={() => setEditing(m)}>
                          Edit
                        </button>
                        <button type="button" style={s.dangerBtn} disabled={busy} onClick={() => void forget(m.id)}>
                          Forget
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            ) : (
              <div style={s.muted}>No memories in this group.</div>
            )}
          </section>
        )
      })}
    </div>
  )
}
