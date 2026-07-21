'use client'

import type { CSSProperties } from 'react'
import { colors } from '@/lib/design-tokens'
import type { WorkQueueCounts, WorkQueueFilter } from '@/lib/coach-work-queue'

type CoachWorkSummaryCardsProps = {
  counts: WorkQueueCounts | null
  filter: WorkQueueFilter
  onFilter: (filter: WorkQueueFilter) => void
}

const CARDS: { key: WorkQueueFilter; label: string; countKey: keyof WorkQueueCounts }[] = [
  { key: 'initial_plan', label: 'Initial Plans', countKey: 'initial_plan' },
  { key: 'checkin_review', label: 'Weekly Reviews', countKey: 'checkin_review' },
  { key: 'call_request', label: 'Call Requests', countKey: 'call_request' },
  { key: 'unread_chat', label: 'Unread Chats', countKey: 'unread_chat' },
  { key: 'issue_report', label: 'Issue Reports', countKey: 'issue_report' },
]

export function CoachWorkSummaryCards({ counts, filter, onFilter }: CoachWorkSummaryCardsProps) {
  return (
    <div style={grid}>
      {CARDS.map(({ key, label, countKey }) => {
        const active = filter === key
        const value = counts?.[countKey] ?? '—'
        return (
          <button
            key={key}
            type="button"
            onClick={() => onFilter(active ? 'all' : key)}
            style={{
              ...card,
              ...(active ? cardActive : {}),
            }}
          >
            <div style={countStyle}>{value}</div>
            <div style={labelStyle}>{label}</div>
          </button>
        )
      })}
    </div>
  )
}

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
  marginBottom: 16,
}

const card: CSSProperties = {
  textAlign: 'left',
  padding: 16,
  borderRadius: 14,
  border: `1px solid ${colors.borderSubtle}`,
  backgroundColor: colors.bgCard,
  cursor: 'pointer',
}

const cardActive: CSSProperties = {
  borderColor: colors.accent,
  backgroundColor: colors.accentMuted,
}

const countStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: colors.textPrimary,
  letterSpacing: '-0.02em',
}

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: colors.textMuted,
  marginTop: 4,
  fontWeight: 600,
}
