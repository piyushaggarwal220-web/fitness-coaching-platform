'use client'

import { useMemo, type CSSProperties } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/height'

export const NUMBER_SCROLLER_PRESETS = {
  age: { min: 13, max: 100, step: 1, unit: 'years' },
  height: { min: MIN_HEIGHT_CM, max: MAX_HEIGHT_CM, step: 1, unit: 'cm' },
  weight: { min: 30, max: 200, step: 1, unit: 'kg' },
  chest: { min: 55, max: 150, step: 1, unit: 'cm' },
  thigh: { min: 35, max: 90, step: 1, unit: 'cm' },
  navel: { min: 55, max: 140, step: 1, unit: 'cm' },
  bicep: { min: 18, max: 60, step: 1, unit: 'cm' },
  food_budget: { min: 1000, max: 100000, step: 500, unit: '₹' },
  feet: { min: 3, max: 8, step: 1, unit: 'ft' },
  inches: { min: 0, max: 11, step: 1, unit: 'in' },
} as const

export type NumberScrollerPreset = keyof typeof NUMBER_SCROLLER_PRESETS

/** @deprecated Use NUMBER_SCROLLER_PRESETS — kept for existing imports. */
export const MEASUREMENT_RANGES = NUMBER_SCROLLER_PRESETS
export type MeasurementKind = NumberScrollerPreset

type NumberScrollerBaseProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
  unit?: string
  min?: number
  max?: number
  step?: number
  /** Legacy — scroll confirm no longer used; kept for API compatibility. */
  requireConfirm?: boolean
  confirmed?: boolean
  onConfirm?: () => void
}

type NumberScrollerProps =
  | (NumberScrollerBaseProps & { preset: NumberScrollerPreset; kind?: never })
  | (NumberScrollerBaseProps & { kind: NumberScrollerPreset; preset?: never })
  | (NumberScrollerBaseProps & { preset?: undefined; kind?: undefined; min: number; max: number })

function resolveRange(props: NumberScrollerProps): {
  min: number
  max: number
  step: number
  unit: string
} {
  const key = props.preset ?? props.kind
  if (key) {
    const preset = NUMBER_SCROLLER_PRESETS[key]
    return {
      min: props.min ?? preset.min,
      max: props.max ?? preset.max,
      step: props.step ?? preset.step,
      unit: props.unit ?? preset.unit,
    }
  }
  return {
    min: props.min!,
    max: props.max!,
    step: props.step ?? 1,
    unit: props.unit ?? '',
  }
}

function formatPlaceholder(unit: string, min: number, max: number): string {
  if (unit === '₹') return `e.g. ${min.toLocaleString('en-IN')} – ${max.toLocaleString('en-IN')}`
  if (!unit) return `Enter ${min}–${max}`
  return `Enter ${min}–${max} ${unit}`
}

function rangeHint(unit: string, min: number, max: number): string {
  if (unit === '₹') return `${min.toLocaleString('en-IN')} – ${max.toLocaleString('en-IN')} per month`
  if (!unit) return `Allowed: ${min}–${max}`
  return `Allowed: ${min}–${max} ${unit}`
}

function parseNumericInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Typed number field — no scroll wheel (avoids accidental changes while scrolling the page). */
export function NumberScroller(props: NumberScrollerProps) {
  const { label, value, onChange, required = false, hint } = props
  const range = resolveRange(props)
  const parsed = useMemo(() => parseNumericInput(value), [value])
  const outOfRange =
    parsed != null && (parsed < range.min || parsed > range.max)

  return (
    <div style={styles.wrap}>
      <label style={styles.labelBlock}>
        <span style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </span>
        <div style={styles.inputRow}>
          <input
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder={formatPlaceholder(range.unit, range.min, range.max)}
            aria-invalid={outOfRange || undefined}
            style={{
              ...styles.input,
              ...(outOfRange ? styles.inputError : {}),
            }}
          />
          {range.unit ? <span style={styles.unitSuffix}>{range.unit}</span> : null}
        </div>
      </label>
      {hint ? <p style={styles.hint}>{hint}</p> : null}
      <p style={{ ...styles.rangeHint, ...(outOfRange ? styles.errorText : {}) }}>
        {outOfRange
          ? `Enter a value between ${range.min} and ${range.max}${range.unit ? ` ${range.unit}` : ''}.`
          : rangeHint(range.unit, range.min, range.max)}
      </p>
    </div>
  )
}

/** Alias for body-tape fields. */
export function MeasurementScroller(
  props: Omit<NumberScrollerBaseProps, 'min' | 'max' | 'step'> & {
    kind: Extract<NumberScrollerPreset, 'chest' | 'thigh' | 'navel' | 'bicep' | 'weight'>
  }
) {
  const { kind, ...rest } = props
  return <NumberScroller {...rest} preset={kind} />
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'grid',
    gap: 6,
  },
  labelBlock: {
    display: 'grid',
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: colors.textSecondary,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 48,
    padding: `0 ${spacing[3]}px`,
    borderRadius: radius.md,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
    fontSize: 16,
    fontVariantNumeric: 'tabular-nums',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: colors.danger,
  },
  unitSuffix: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.textMuted,
    flexShrink: 0,
  },
  hint: {
    margin: 0,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  rangeHint: {
    margin: 0,
    fontSize: 12,
    color: colors.textMuted,
  },
  errorText: {
    color: colors.danger,
  },
}
