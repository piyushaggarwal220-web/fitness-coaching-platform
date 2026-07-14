'use client'

import { colors, spacing } from '@/lib/design-tokens'
import { parseCoachReminders } from '@/lib/daily-tracker/display'
import type { TrackerNoteItem } from '@/lib/daily-tracker/types'
import { Sparkles } from 'lucide-react'

export function CoachNotesCard({ note }: { note: TrackerNoteItem }) {
  const reminders = parseCoachReminders(note.body)

  return (
    <div style={{ paddingTop: spacing[3] }}>
      {reminders.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {reminders.map((line, i) => (
            <li
              key={i}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: colors.bgElevated,
                border: `1px solid ${colors.borderSubtle}`,
                marginBottom: 8,
                fontSize: 14,
                lineHeight: 1.5,
                color: colors.textSecondary,
              }}
            >
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: colors.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {note.body}
        </p>
      )}
    </div>
  )
}

export function MotivationCard({ message, staggerIndex }: { message: string; staggerIndex?: number }) {
  return (
    <div
      className={`motion-card-enter ${staggerIndex != null ? `motion-stagger-${Math.min(staggerIndex, 8)}` : ''}`}
      style={{
        padding: spacing[4],
        borderRadius: 20,
        marginBottom: spacing[4],
        background: `linear-gradient(135deg, ${colors.accentMuted}, rgba(24,24,27,0.9))`,
        border: `1px solid ${colors.accentMuted}`,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <Sparkles size={22} color={colors.accent} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Motivation
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: colors.textPrimary }}>
          {message}
        </p>
      </div>
    </div>
  )
}
