'use client'

import { useEffect, useState } from 'react'
import { trackerInputStyle } from '@/components/tracker/TrackerPrimitives'
import { clientColors as colors } from '@/lib/design-tokens'

const MAX_LENGTH = 400

type Props = {
  label: string
  placeholder: string
  value: string
  onSave: (next: string) => void
}

/** A short note of what the client did instead of the planned meal or exercise. */
export function SubstitutionField({ label, placeholder, value, onSave }: Props) {
  const [text, setText] = useState(value)

  useEffect(() => {
    setText(value)
  }, [value])

  const commit = () => {
    const next = text.trim().slice(0, MAX_LENGTH)
    if (next === value.trim()) return
    setText(next)
    onSave(next)
  }

  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <span style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: colors.textSecondary }}>
        {label}
      </span>
      <textarea
        value={text}
        placeholder={placeholder}
        rows={2}
        maxLength={MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        style={{
          ...trackerInputStyle,
          minHeight: 72,
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: 1.45,
        }}
      />
      {value.trim() ? (
        <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: colors.textMuted }}>
          Saved on today&apos;s record.
        </span>
      ) : null}
    </label>
  )
}
