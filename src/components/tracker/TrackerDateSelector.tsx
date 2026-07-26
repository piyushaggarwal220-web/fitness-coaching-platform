'use client'

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { shiftTrackerDateKey } from '@/lib/daily-tracker/date'
import { colors, radius, spacing } from '@/lib/design-tokens'

type Props = {
  value: string
  min: string
  max: string
  disabled?: boolean
  onChange: (date: string) => void
}

function formatSelectedDay(value: string, max: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  const formatted = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(date)
  return value === max ? `Today, ${formatted}` : formatted
}

export function TrackerDateSelector({ value, min, max, disabled, onChange }: Props) {
  const previous = shiftTrackerDateKey(value, -1)
  const next = shiftTrackerDateKey(value, 1)
  const canGoBack = previous >= min
  const canGoForward = next <= max

  return (
    <div
      aria-label="Tracker day selector"
      style={{
        marginBottom: spacing[4],
        padding: '12px 14px',
        borderRadius: radius.md,
        background: colors.bgGlass,
        border: `1px solid ${colors.borderSubtle}`,
      }}
    >
      <div
        style={{
          marginBottom: 8,
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Choose tracker day
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px minmax(0, 1fr) 44px',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          type="button"
          aria-label="Previous day"
          disabled={disabled || !canGoBack}
          onClick={() => onChange(previous)}
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: radius.sm,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgElevated,
            color: colors.textPrimary,
            opacity: disabled || !canGoBack ? 0.4 : 1,
            cursor: disabled || !canGoBack ? 'default' : 'pointer',
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <label
          style={{
            minWidth: 0,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: radius.sm,
            border: `1px solid ${colors.accentMuted}`,
            background: colors.accentMuted,
            color: colors.textPrimary,
            cursor: disabled ? 'default' : 'pointer',
            position: 'relative',
          }}
        >
          <CalendarDays size={18} color={colors.accent} style={{ flexShrink: 0 }} />
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {formatSelectedDay(value, max)}
          </span>
          <input
            type="date"
            aria-label="Select tracker date"
            value={value}
            min={min}
            max={max}
            disabled={disabled}
            onChange={(event) => {
              if (event.target.value) onChange(event.target.value)
            }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: disabled ? 'default' : 'pointer',
            }}
          />
        </label>

        <button
          type="button"
          aria-label="Next day"
          disabled={disabled || !canGoForward}
          onClick={() => onChange(next)}
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            borderRadius: radius.sm,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgElevated,
            color: colors.textPrimary,
            opacity: disabled || !canGoForward ? 0.4 : 1,
            cursor: disabled || !canGoForward ? 'default' : 'pointer',
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  )
}
