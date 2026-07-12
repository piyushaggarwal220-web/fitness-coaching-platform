'use client'

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'

const baseInputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 56,
  padding: `${spacing[2]}px ${spacing[3]}px`,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: radius.sm,
  fontSize: 16,
  boxSizing: 'border-box',
  backgroundColor: colors.bgElevated,
  color: colors.textPrimary,
  outline: 'none',
  transition: 'border-color 150ms ease',
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
}

export function Input({ label, error, style, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div style={{ marginBottom: spacing[3] }}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'block', marginBottom: spacing[1], fontSize: 14, fontWeight: 500, color: colors.textSecondary }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{ ...baseInputStyle, ...(error ? { borderColor: colors.danger } : {}), ...style }}
        {...props}
      />
      {error && <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.danger }}>{error}</p>}
    </div>
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  error?: string
}

export function TextArea({ label, error, style, id, ...props }: TextAreaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div style={{ marginBottom: spacing[3] }}>
      {label && (
        <label htmlFor={inputId} style={{ display: 'block', marginBottom: spacing[1], fontSize: 14, fontWeight: 500, color: colors.textSecondary }}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        style={{
          ...baseInputStyle,
          minHeight: 120,
          resize: 'vertical',
          fontFamily: 'inherit',
          ...(error ? { borderColor: colors.danger } : {}),
          ...style,
        }}
        {...props}
      />
      {error && <p style={{ margin: '6px 0 0', fontSize: 13, color: colors.danger }}>{error}</p>}
    </div>
  )
}

type SliderProps = {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  min?: number
  max?: number
}

export function Slider({ label, name, value, onChange, min = 1, max = 10 }: SliderProps) {
  const numValue = Number(value) || min

  return (
    <div style={{ marginBottom: spacing[4] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[2] }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: colors.textPrimary }}>{label}</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: colors.accent }}>{numValue}</span>
      </div>
      <input
        type="range"
        name={name}
        value={numValue}
        onChange={onChange}
        min={min}
        max={max}
        step={1}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 12, color: colors.textMuted }}>{min}</span>
        <span style={{ fontSize: 12, color: colors.textMuted }}>{max}</span>
      </div>
    </div>
  )
}
