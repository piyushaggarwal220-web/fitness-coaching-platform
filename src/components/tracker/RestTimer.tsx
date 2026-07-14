'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, Timer, X } from 'lucide-react'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { formatRestClock } from '@/lib/daily-tracker/exercise-utils'

type Props = {
  seconds: number
  exerciseName: string
  nextLabel: string
  onDismiss: () => void
}

/** Rest between sets — Start / Pause / Stop. Caps at the plan rest duration. */
export function RestTimer({ seconds, exerciseName, nextLabel, onDismiss }: Props) {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(false)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    setRemaining(seconds)
    setRunning(false)
  }, [seconds, exerciseName, nextLabel])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(id)
          setRunning(false)
          dismissRef.current()
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [running, seconds, exerciseName, nextLabel])

  const progress = seconds > 0 ? ((seconds - remaining) / seconds) * 100 : 100

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 12,
        zIndex: 40,
        marginTop: spacing[4],
        padding: spacing[4],
        borderRadius: radius.lg,
        background: colors.bgGlass,
        backdropFilter: 'blur(20px)',
        border: `1px solid ${colors.accentMuted}`,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 700,
              color: colors.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <Timer size={14} />
            Rest timer
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{exerciseName}</div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
            Target {formatRestClock(seconds)} · Next: {nextLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() => dismissRef.current()}
          aria-label="Close rest timer"
          style={{
            border: 'none',
            background: colors.bgElevated,
            borderRadius: 999,
            width: 36,
            height: 36,
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            color: colors.textMuted,
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div
        style={{
          marginTop: spacing[3],
          fontSize: 48,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          textAlign: 'center',
          color: colors.textPrimary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatRestClock(remaining)}
      </div>

      <div
        style={{
          marginTop: spacing[3],
          height: 6,
          borderRadius: 999,
          background: colors.bgElevated,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, progress)}%`,
            background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentMuted})`,
            transition: 'width 1s linear',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: spacing[3] }}>
        <button
          type="button"
          onClick={() => setRunning((value) => !value)}
          style={{
            height: 44,
            borderRadius: 12,
            border: 'none',
            background: running ? colors.bgElevated : colors.accent,
            color: running ? colors.textPrimary : colors.textInverse,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {running ? <Pause size={16} /> : <Play size={16} />}
          {running ? 'Pause' : remaining < seconds ? 'Resume' : 'Start'}
        </button>
        <button
          type="button"
          onClick={() => dismissRef.current()}
          style={{
            height: 44,
            borderRadius: 12,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgElevated,
            color: colors.textPrimary,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Stop
        </button>
      </div>
    </div>
  )
}
