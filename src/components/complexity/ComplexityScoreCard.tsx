'use client'

import type { CSSProperties } from 'react'
import {
  COMPLEXITY_TIER_COLORS,
  formatScoreChange,
  formatScoreTransition,
  formatTierLabel,
} from '@/lib/complexity/display'
import type { StoredComplexityTier } from '@/lib/ai/complexity-score'

type ComplexityScoreCardProps = {
  score: number | null | undefined
  tier: StoredComplexityTier | string | null | undefined
  previousScore?: number | null
  scoreChange?: number | null
  lastCalculatedAt?: string | null
  compact?: boolean
}

export function ComplexityScoreCard({
  score,
  tier,
  previousScore,
  scoreChange,
  lastCalculatedAt,
  compact = false,
}: ComplexityScoreCardProps) {
  if (score == null || !tier) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Complexity Score</h3>
        <p style={styles.pending}>Not calculated yet</p>
      </div>
    )
  }

  const tierKey = tier.toLowerCase() as StoredComplexityTier
  const colors = COMPLEXITY_TIER_COLORS[tierKey] ?? COMPLEXITY_TIER_COLORS.medium
  const change = formatScoreChange(scoreChange)

  return (
    <div style={{ ...styles.card, borderColor: colors.border }}>
      <h3 style={styles.title}>Complexity Score</h3>
      <div style={styles.mainRow}>
        <div style={{ ...styles.scoreBadge, backgroundColor: colors.bg, color: colors.text }}>
          <span style={styles.scoreValue}>{score}</span>
          <span style={styles.scoreMax}>/ 100</span>
        </div>
        <div>
          <div style={styles.tierLabel}>Current Tier</div>
          <div style={{ ...styles.tierPill, backgroundColor: colors.bg, color: colors.text }}>
            {formatTierLabel(tierKey)}
          </div>
        </div>
      </div>

      {!compact && previousScore != null && (
        <div style={styles.changeRow}>
          <span style={styles.transition}>{formatScoreTransition(previousScore, score)}</span>
          <span
            style={{
              ...styles.changeBadge,
              color:
                change.direction === 'improved'
                  ? '#155724'
                  : change.direction === 'increased'
                    ? '#721c24'
                    : '#666',
            }}
          >
            {change.arrow} {change.label}
          </span>
        </div>
      )}

      {!compact && lastCalculatedAt && (
        <p style={styles.meta}>Last calculated {new Date(lastCalculatedAt).toLocaleString()}</p>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    border: '2px solid #e8e8e8',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  title: { margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#1a1a2e' },
  pending: { margin: 0, color: '#888', fontSize: 14 },
  mainRow: { display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' },
  scoreBadge: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
    padding: '12px 18px',
    borderRadius: 10,
    fontWeight: 700,
  },
  scoreValue: { fontSize: 32, lineHeight: 1 },
  scoreMax: { fontSize: 16, fontWeight: 500, opacity: 0.85 },
  tierLabel: { fontSize: 12, color: '#888', textTransform: 'uppercase', marginBottom: 6 },
  tierPill: {
    display: 'inline-block',
    padding: '6px 14px',
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 600,
  },
  changeRow: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid #eee',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  transition: { fontSize: 18, fontWeight: 600, color: '#333' },
  changeBadge: { fontSize: 14, fontWeight: 600 },
  meta: { margin: '12px 0 0', fontSize: 12, color: '#999' },
}
