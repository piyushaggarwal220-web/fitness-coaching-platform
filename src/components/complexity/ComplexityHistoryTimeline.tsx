'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { COMPLEXITY_TIER_COLORS, formatTierLabel } from '@/lib/complexity/display'
import type { ComplexityScoreHistory } from '@/types/database'
import type { StoredComplexityTier } from '@/lib/ai/complexity-score'

type ComplexityHistoryTimelineProps = {
  clientId: string
}

export function ComplexityHistoryTimeline({ clientId }: ComplexityHistoryTimelineProps) {
  const [history, setHistory] = useState<ComplexityScoreHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    fetch(`/api/complexity/history?clientId=${encodeURIComponent(clientId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (json.error) {
          setError(json.error)
        } else {
          setHistory((json.history ?? []) as ComplexityScoreHistory[])
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load complexity history.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [clientId])

  if (loading) {
    return <p style={styles.muted}>Loading complexity history…</p>
  }

  if (error) {
    return <p style={styles.error}>{error}</p>
  }

  if (history.length === 0) {
    return <p style={styles.muted}>No complexity history yet.</p>
  }

  const chronological = [...history].reverse()

  return (
    <div style={styles.list}>
      {chronological.map((entry, index) => {
        const tierKey = entry.tier as StoredComplexityTier
        const colors = COMPLEXITY_TIER_COLORS[tierKey]
        return (
          <div key={entry.id} style={styles.item}>
            <div style={styles.week}>Week {index + 1}</div>
            <div style={styles.scoreRow}>
              <span style={styles.score}>{entry.display_score}</span>
              <span style={{ ...styles.tier, backgroundColor: colors.bg, color: colors.text }}>
                {formatTierLabel(tierKey)}
              </span>
            </div>
            {entry.score_change != null && entry.score_change !== 0 && (
              <div style={styles.delta}>
                {entry.score_change < 0 ? '▼' : '▲'} {Math.abs(entry.score_change)} pts
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  item: {
    display: 'grid',
    gridTemplateColumns: '80px 1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #eee',
  },
  week: { fontSize: 13, color: '#888', fontWeight: 600 },
  scoreRow: { display: 'flex', alignItems: 'center', gap: 12 },
  score: { fontSize: 22, fontWeight: 700, color: '#1a1a2e' },
  tier: { padding: '4px 10px', borderRadius: 999, fontSize: 13, fontWeight: 600 },
  delta: { fontSize: 13, color: '#666' },
  muted: { margin: 0, color: '#888', fontSize: 14 },
  error: { margin: 0, color: '#c0392b', fontSize: 14 },
}
