'use client'

import { useCallback, useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import * as s from './styles'

type LearningCenterPayload = {
  recent_lessons: Record<string, unknown>[]
  decisions: Record<string, unknown>[]
  outcomes: Record<string, unknown>[]
  patterns: Record<string, unknown>[]
  preferences: Record<string, unknown>[]
  hypotheses: Record<string, unknown>[]
  memory_review: Record<string, unknown>[]
  awaiting_measurement: Record<string, unknown>[]
  preference_confirmations: Record<string, unknown>[]
}

const SECTIONS: { key: keyof LearningCenterPayload; label: string }[] = [
  { key: 'recent_lessons', label: 'RECENT LESSONS' },
  { key: 'decisions', label: 'DECISIONS' },
  { key: 'outcomes', label: 'OUTCOMES' },
  { key: 'patterns', label: 'PATTERNS' },
  { key: 'preferences', label: 'PREFERENCES' },
  { key: 'hypotheses', label: 'HYPOTHESES' },
  { key: 'memory_review', label: 'MEMORY REVIEW' },
  { key: 'awaiting_measurement', label: 'AWAITING MEASUREMENT' },
]

function cell(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v).slice(0, 280)
  } catch {
    return '—'
  }
}

function OutcomeCard({ row }: { row: Record<string, unknown> }) {
  const decision = row.jarvis_decisions as Record<string, unknown> | null
  const comparison = row.comparison as { metrics?: { statement?: string }[] } | null
  return (
    <div style={{ ...s.card, marginTop: 8 }}>
      <div style={{ fontWeight: 700 }}>
        {cell(decision?.objective || row.decision_id)}
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6, display: 'grid', gap: 4 }}>
        <div>
          <span style={s.eyebrow}>EXPECTED</span> {cell(row.expected || decision?.expected_outcome)}
        </div>
        <div>
          <span style={s.eyebrow}>ACTUAL</span> {cell(row.actual)}
        </div>
        <div>
          <span style={s.eyebrow}>OUTCOME</span> {cell(row.outcome_state || row.status)}
        </div>
        <div>
          <span style={s.eyebrow}>EVIDENCE</span> {cell(row.evidence_label)} —{' '}
          {comparison?.metrics?.[0]?.statement || 'n/a'}
        </div>
        <div>
          <span style={s.eyebrow}>DUE / MEASURED</span> {cell(row.due_at)} / {cell(row.measured_at)}
        </div>
      </div>
    </div>
  )
}

function GenericCard({ row }: { row: Record<string, unknown> }) {
  return (
    <div style={{ ...s.card, marginTop: 8 }}>
      <div style={{ fontWeight: 700 }}>{cell(row.title || row.objective || row.id)}</div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
        {cell(row.summary || row.reason || row.ask || row.proposed_preference)}
      </div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {row.confidence != null ? <span>CONFIDENCE {cell(row.confidence)}</span> : null}
        {row.scope != null ? <span>SCOPE {cell(row.scope)}</span> : null}
        {row.sample_size != null ? <span>n={cell(row.sample_size)}</span> : null}
        {row.evidence_label != null ? <span>{cell(row.evidence_label)}</span> : null}
        {row.outcome_state != null ? <span>{cell(row.outcome_state)}</span> : null}
        {row.memory_status != null ? <span>{cell(row.memory_status)}</span> : null}
        {row.created_at != null ? <span>{cell(row.created_at)}</span> : null}
        {Array.isArray(row.review_issues) && row.review_issues.length ? (
          <span>ISSUES {(row.review_issues as string[]).join(', ')}</span>
        ) : null}
      </div>
    </div>
  )
}

export function LearningCenterView() {
  const [data, setData] = useState<LearningCenterPayload | null>(null)
  const [error, setError] = useState('')
  const [section, setSection] = useState<keyof LearningCenterPayload>('recent_lessons')
  const [query, setQuery] = useState('')
  const [queryAnswer, setQueryAnswer] = useState<{ kind: string; answer: string; items: unknown[] } | null>(
    null
  )

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/jarvis/learning')
    const json = await res.json()
    if (!json.success) throw new Error(json.error || 'Failed to load learning center')
    setData(json.learning as LearningCenterPayload)
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

  async function askLearning() {
    if (!query.trim()) return
    setError('')
    try {
      const res = await fetch('/api/admin/jarvis/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Query failed')
      setQueryAnswer(json.result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed')
    }
  }

  const rows = (data?.[section] as Record<string, unknown>[] | undefined) ?? []

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={s.eyebrow}>LEARNING CENTER</div>
      <h2 style={{ margin: '6px 0 8px', fontSize: 24 }}>What happened → what we learned</h2>
      <p style={{ ...s.muted, marginBottom: 14 }}>
        Decisions, expected outcomes, measured results, and evidence-backed lessons. Observational — not causal.
      </p>
      {error ? <div style={{ color: colors.danger, marginBottom: 10 }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          style={{ ...s.input, flex: 1 }}
          placeholder='Ask: "What have you learned recently?" / "Show me my preferences"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void askLearning()
          }}
        />
        <button type="button" style={s.primaryBtn} onClick={() => void askLearning()}>
          Ask
        </button>
      </div>

      {queryAnswer ? (
        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={s.eyebrow}>{queryAnswer.kind}</div>
          <div style={{ marginTop: 6 }}>{queryAnswer.answer}</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>
            {queryAnswer.items.length} item(s)
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {SECTIONS.map((sec) => (
          <button
            key={sec.key}
            type="button"
            style={section === sec.key ? s.primaryBtn : s.ghostBtn}
            onClick={() => setSection(sec.key)}
          >
            {sec.label}
            {data ? ` (${(data[sec.key] as unknown[])?.length ?? 0})` : ''}
          </button>
        ))}
      </div>

      {!data ? (
        <div style={s.muted}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={s.muted}>No records in this section yet.</div>
      ) : section === 'outcomes' ? (
        rows.map((row, i) => <OutcomeCard key={String(row.id ?? i)} row={row} />)
      ) : (
        rows.map((row, i) => <GenericCard key={String(row.id ?? i)} row={row} />)
      )}

      {data?.preference_confirmations?.length ? (
        <section style={{ marginTop: 24 }}>
          <div style={s.eyebrow}>PREFERENCE CONFIRMATION CANDIDATES</div>
          {data.preference_confirmations.map((row, i) => (
            <GenericCard key={i} row={row} />
          ))}
        </section>
      ) : null}
    </div>
  )
}
