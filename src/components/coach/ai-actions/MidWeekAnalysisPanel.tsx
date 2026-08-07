'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { colors } from '@/lib/coach-theme'

type MidWeekAnalysisPanelProps = {
  checkinId: string
}

export function MidWeekAnalysisPanel({ checkinId }: MidWeekAnalysisPanelProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const autoGenAttempted = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/coach/midweek-summary?checkinId=${encodeURIComponent(checkinId)}`
      )
      const data = (await res.json().catch(() => null)) as {
        summary?: string | null
        error?: string
      } | null
      if (!res.ok) {
        setError(data?.error ?? 'Could not load AI summary')
        setSummary(null)
        return
      }
      setSummary(data?.summary?.trim() || null)
    } catch {
      setError('Could not load AI summary')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [checkinId])

  useEffect(() => {
    autoGenAttempted.current = false
    void load()
  }, [load])

  // Auto-generate once if nothing cached yet (covers submissions before auto-gen existed)
  useEffect(() => {
    if (loading || summary || generating || error || autoGenAttempted.current) return
    autoGenAttempted.current = true
    let cancelled = false
    const run = async () => {
      setGenerating(true)
      try {
        const res = await fetch('/api/coach/midweek-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkinId }),
        })
        const data = (await res.json().catch(() => null)) as {
          summary?: string
          error?: string
        } | null
        if (cancelled) return
        if (!res.ok) {
          setError(data?.error ?? 'AI summary failed')
          return
        }
        setSummary(data?.summary?.trim() || null)
      } catch {
        if (!cancelled) setError('AI summary failed')
      } finally {
        if (!cancelled) setGenerating(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [loading, summary, generating, error, checkinId])

  const regenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/coach/midweek-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkinId, force: true }),
      })
      const data = (await res.json().catch(() => null)) as {
        summary?: string
        error?: string
      } | null
      if (!res.ok) {
        setError(data?.error ?? 'AI summary failed')
        return
      }
      setSummary(data?.summary?.trim() || null)
    } catch {
      setError('AI summary failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Coach briefing (AI)</h2>
          <p style={styles.subtitle}>
            Skim this first — then use the raw scores below. Uses AI credits.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={generating || loading}
          style={styles.refreshBtn}
        >
          {generating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>
      {(loading || generating) && !summary && (
        <p style={styles.muted}>Generating coach briefing from client scores and notes…</p>
      )}
      {error && <p style={styles.error}>{error}</p>}
      {summary && <pre style={styles.summary}>{summary}</pre>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: colors.textPrimary,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  refreshBtn: {
    border: `1px solid ${colors.borderSubtle}`,
    background: colors.bgCard,
    color: colors.textMuted,
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  muted: {
    margin: 0,
    fontSize: 13,
    color: colors.textMuted,
  },
  error: {
    margin: '0 0 8px',
    fontSize: 13,
    color: colors.danger,
  },
  summary: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.55,
    color: colors.textPrimary,
    background: colors.bgSecondary,
    borderRadius: 10,
    padding: 14,
    borderLeft: `3px solid ${colors.accent}`,
  },
}
