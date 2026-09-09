'use client'

import { useEffect, useRef, useState } from 'react'
import { trackerInputStyle } from '@/components/tracker/TrackerPrimitives'
import { colors } from '@/lib/design-tokens'
import { durationFromParts, formatDurationInput } from '@/lib/daily-tracker/exercise-utils'
import {
  finishNumberDraft,
  formatCommittedNumber,
  isUnfinishedNumberDraft,
  parseOptionalNumber,
} from '@/lib/daily-tracker/set-input'

type Props = {
  value: number | null | undefined
  placeholder?: string
  disabled?: boolean
  inputMode?: 'decimal' | 'numeric'
  'aria-label'?: string
  onCommit: (value: number | null) => void
}

const COMMIT_MS = 450

export function SetLogField({
  value,
  placeholder,
  disabled,
  inputMode = 'decimal',
  'aria-label': ariaLabel,
  onCommit,
}: Props) {
  const [draft, setDraft] = useState(() => formatCommittedNumber(value))
  const focusedRef = useRef(false)
  const commitTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatCommittedNumber(value))
  }, [value])

  useEffect(() => {
    return () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current)
    }
  }, [])

  const scheduleCommit = (raw: string) => {
    if (commitTimer.current) window.clearTimeout(commitTimer.current)
    if (isUnfinishedNumberDraft(raw)) return
    commitTimer.current = window.setTimeout(() => {
      onCommit(parseOptionalNumber(raw))
    }, COMMIT_MS)
  }

  return (
    <input
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
        if (commitTimer.current) {
          window.clearTimeout(commitTimer.current)
          commitTimer.current = null
        }
        const next = finishNumberDraft(draft)
        onCommit(next)
        setDraft(formatCommittedNumber(next))
      }}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        scheduleCommit(raw)
      }}
      style={trackerInputStyle}
    />
  )
}

type TextProps = {
  value: string | null | undefined
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
  onCommit: (value: string) => void
}

/** Free text (bed/wake time) that does not rewrite the box on every parent save. */
export function TrackerTextField({
  value,
  placeholder,
  disabled,
  'aria-label': ariaLabel,
  onCommit,
}: TextProps) {
  const [draft, setDraft] = useState(() => value ?? '')
  const focusedRef = useRef(false)
  const commitTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? '')
  }, [value])

  useEffect(() => {
    return () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current)
    }
  }, [])

  const flush = (raw: string) => {
    onCommit(raw)
  }

  return (
    <input
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
        if (commitTimer.current) {
          window.clearTimeout(commitTimer.current)
          commitTimer.current = null
        }
        flush(draft)
      }}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (commitTimer.current) window.clearTimeout(commitTimer.current)
        commitTimer.current = window.setTimeout(() => flush(raw), COMMIT_MS)
      }}
      style={trackerInputStyle}
    />
  )
}

type DurationProps = {
  durationSeconds: number | null | undefined
  disabled?: boolean
  minutePlaceholder?: string
  secondPlaceholder?: string
  onCommit: (durationSeconds: number | null) => void
}

export function DurationLogFields({
  durationSeconds,
  disabled,
  minutePlaceholder,
  secondPlaceholder,
  onCommit,
}: DurationProps) {
  const committed = formatDurationInput(durationSeconds)
  const [minutes, setMinutes] = useState(committed.minutes)
  const [seconds, setSeconds] = useState(committed.seconds)
  const focusRef = useRef<'m' | 's' | null>(null)
  const commitTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!focusRef.current) {
      setMinutes(committed.minutes)
      setSeconds(committed.seconds)
    }
  }, [committed.minutes, committed.seconds])

  useEffect(() => {
    return () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current)
    }
  }, [])

  const flush = (m: string, s: string, fromBlur: boolean) => {
    if (!fromBlur && (isUnfinishedNumberDraft(m) || isUnfinishedNumberDraft(s))) return
    const mm = fromBlur ? formatCommittedNumber(finishNumberDraft(m)) : m
    const ss = fromBlur ? formatCommittedNumber(finishNumberDraft(s)) : s
    if (mm.trim() === '' && ss.trim() === '') {
      onCommit(null)
      return
    }
    onCommit(durationFromParts(mm, ss) ?? null)
  }

  const schedule = (m: string, s: string) => {
    if (commitTimer.current) window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(() => flush(m, s, false), COMMIT_MS)
  }

  const blurAll = (m: string, s: string) => {
    focusRef.current = null
    if (commitTimer.current) {
      window.clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
    const nextM = formatCommittedNumber(finishNumberDraft(m))
    const nextS = formatCommittedNumber(finishNumberDraft(s))
    setMinutes(nextM)
    setSeconds(nextS)
    flush(m, s, true)
  }

  return (
    <>
      <div>
        <label style={{ fontSize: 10, color: colors.textMuted }}>Minutes</label>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Minutes"
          placeholder={minutePlaceholder}
          value={minutes}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => {
            focusRef.current = 'm'
          }}
          onBlur={(e) => blurAll(e.target.value, seconds)}
          onChange={(e) => {
            const raw = e.target.value
            setMinutes(raw)
            schedule(raw, seconds)
          }}
          style={trackerInputStyle}
        />
      </div>
      <div>
        <label style={{ fontSize: 10, color: colors.textMuted }}>Seconds</label>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Seconds"
          placeholder={secondPlaceholder}
          value={seconds}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => {
            focusRef.current = 's'
          }}
          onBlur={(e) => blurAll(minutes, e.target.value)}
          onChange={(e) => {
            const raw = e.target.value
            setSeconds(raw)
            schedule(minutes, raw)
          }}
          style={trackerInputStyle}
        />
      </div>
    </>
  )
}
