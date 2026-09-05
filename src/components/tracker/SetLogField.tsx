'use client'

import { useEffect, useRef, useState } from 'react'
import { trackerInputStyle } from '@/components/tracker/TrackerPrimitives'
import { formatCommittedNumber, parseOptionalNumber } from '@/lib/daily-tracker/set-input'

type Props = {
  value: number | null | undefined
  placeholder?: string
  disabled?: boolean
  inputMode?: 'decimal' | 'numeric'
  'aria-label'?: string
  onCommit: (value: number | null) => void
}

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

  const commit = (raw: string) => {
    onCommit(parseOptionalNumber(raw))
  }

  return (
    <input
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
        if (commitTimer.current) {
          window.clearTimeout(commitTimer.current)
          commitTimer.current = null
        }
        commit(draft)
        setDraft(formatCommittedNumber(parseOptionalNumber(draft)))
      }}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (commitTimer.current) window.clearTimeout(commitTimer.current)
        commitTimer.current = window.setTimeout(() => commit(raw), 280)
      }}
      style={trackerInputStyle}
    />
  )
}
