'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { readApiJson } from '@/lib/api-response'
import { colors } from '@/lib/coach-theme'

type CheckinReplyPanelProps = {
  checkinId: string
  /** Called at most once after the check-in summary is first loaded. */
  onEnsured?: () => void
}

export function CheckinReplyPanel({ checkinId, onEnsured }: CheckinReplyPanelProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [label, setLabel] = useState('Client check-in')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const onEnsuredRef = useRef(onEnsured)
  const ensuredOnceRef = useRef(false)
  const loadedCheckinIdRef = useRef<string | null>(null)

  useEffect(() => {
    onEnsuredRef.current = onEnsured
  }, [onEnsured])

  useEffect(() => {
    let active = true

    // Keep the existing card visible while switching/reloading the same check-in.
    if (loadedCheckinIdRef.current !== checkinId) {
      setLoading(true)
      setError('')
      setSummary(null)
      ensuredOnceRef.current = false
    }

    const load = async () => {
      const response = await fetch(`/api/coach/checkin/${encodeURIComponent(checkinId)}/for-chat`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const parsed = await readApiJson<{
        summary?: string
        checkin?: { checkin_type?: string; coaching_week?: number | null }
        ensureError?: string | null
      }>(response)
      if (!active) return
      if (!parsed.ok || !parsed.data.summary) {
        setError(parsed.ok ? 'Could not load this check-in.' : parsed.error)
        setLoading(false)
        return
      }
      const week = parsed.data.checkin?.coaching_week
      const typeLabel =
        parsed.data.checkin?.checkin_type === 'weekly' ? 'Weekly check-in' : 'Mid-week check-in'
      setLabel(week != null ? `${typeLabel} · Week ${week}` : typeLabel)
      setSummary(parsed.data.summary)
      loadedCheckinIdRef.current = checkinId
      setLoading(false)
      if (!ensuredOnceRef.current) {
        ensuredOnceRef.current = true
        onEnsuredRef.current?.()
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [checkinId])

  if (loading && !summary) {
    return <div style={styles.panel}>Loading client check-in…</div>
  }

  if ((error || !summary) && !summary) {
    return (
      <div style={{ ...styles.panel, borderColor: colors.danger }}>
        {error || 'Client check-in could not be loaded.'}
      </div>
    )
  }

  return (
    <div style={styles.panel}>
      <div style={styles.eyebrow}>{label}</div>
      <div style={styles.hint}>Tap Reply on this check-in in chat, then send text or a voice note</div>
      <pre style={styles.summary}>{summary}</pre>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    flexShrink: 0,
    margin: '0 0 10px',
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${colors.accent}`,
    background: colors.accentMuted || 'rgba(245, 158, 11, 0.12)',
    color: colors.textPrimary,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    color: colors.accent,
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  summary: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    fontSize: 13.5,
    lineHeight: 1.5,
    color: colors.textPrimary,
  },
}
