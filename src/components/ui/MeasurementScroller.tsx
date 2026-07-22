'use client'

import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from '@/lib/height'

const ITEM_HEIGHT = 44
const VISIBLE_ROWS = 5

export const NUMBER_SCROLLER_PRESETS = {
  age: { min: 13, max: 100, step: 1, unit: 'years' },
  height: { min: MIN_HEIGHT_CM, max: MAX_HEIGHT_CM, step: 1, unit: 'cm' },
  weight: { min: 30, max: 200, step: 1, unit: 'kg' },
  chest: { min: 70, max: 150, step: 1, unit: 'cm' },
  thigh: { min: 35, max: 90, step: 1, unit: 'cm' },
  navel: { min: 55, max: 140, step: 1, unit: 'cm' },
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
}

type NumberScrollerProps =
  | (NumberScrollerBaseProps & { preset: NumberScrollerPreset; kind?: never })
  | (NumberScrollerBaseProps & { kind: NumberScrollerPreset; preset?: never })
  | (NumberScrollerBaseProps & { preset?: undefined; kind?: undefined; min: number; max: number })

function buildOptions(min: number, max: number, step: number): number[] {
  const values: number[] = []
  const safeStep = step > 0 ? step : 1
  for (let n = min; n <= max; n += safeStep) values.push(n)
  if (values[values.length - 1] !== max) values.push(max)
  return values
}

function parseSelected(value: string, options: number[]): number | null {
  if (!value.trim()) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  // Prefer exact match; otherwise nearest option within half-step tolerance.
  if (options.includes(n)) return n
  let best: number | null = null
  let bestDist = Infinity
  for (const option of options) {
    const dist = Math.abs(option - n)
    if (dist < bestDist) {
      best = option
      bestDist = dist
    }
  }
  return best
}

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

function formatDisplay(value: number, unit: string): string {
  if (unit === '₹') return `₹${value.toLocaleString('en-IN')}`
  if (!unit) return String(value)
  return `${value} ${unit}`
}

/** Wheel-style picker — scroll to choose a number (no typing). */
export function NumberScroller(props: NumberScrollerProps) {
  const { label, value, onChange, required = false, hint } = props
  const range = resolveRange(props)
  const options = useMemo(
    () => buildOptions(range.min, range.max, range.step),
    [range.min, range.max, range.step]
  )
  const listRef = useRef<HTMLDivElement>(null)
  const settlingRef = useRef(false)
  const skipScrollSyncRef = useRef(false)
  const selected = parseSelected(value, options)

  const scrollToValue = (next: number, behavior: ScrollBehavior = 'auto') => {
    const el = listRef.current
    if (!el) return
    const index = options.indexOf(next)
    if (index < 0) return
    settlingRef.current = true
    el.scrollTo({ top: index * ITEM_HEIGHT, behavior })
    window.setTimeout(() => {
      settlingRef.current = false
    }, behavior === 'smooth' ? 280 : 40)
  }

  useEffect(() => {
    if (selected == null) return
    if (skipScrollSyncRef.current) {
      skipScrollSyncRef.current = false
      return
    }
    scrollToValue(selected, 'auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const commitValue = (next: number) => {
    if (String(next) === value) return
    skipScrollSyncRef.current = true
    onChange(String(next))
  }

  const commitFromScroll = () => {
    const el = listRef.current
    if (!el || settlingRef.current) return
    const index = Math.round(el.scrollTop / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(options.length - 1, index))
    const next = options[clamped]
    if (next == null) return
    const top = clamped * ITEM_HEIGHT
    if (Math.abs(el.scrollTop - top) > 1) {
      settlingRef.current = true
      el.scrollTo({ top, behavior: 'smooth' })
      window.setTimeout(() => {
        settlingRef.current = false
      }, 220)
    }
    commitValue(next)
  }

  return (
    <div style={styles.wrap}>
      <style>{`
        [data-number-scroller]::-webkit-scrollbar { display: none; }
      `}</style>
      <div style={styles.header}>
        <span style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </span>
        <span style={styles.value}>
          {selected != null ? formatDisplay(selected, range.unit) : 'Scroll to select'}
        </span>
      </div>
      {hint ? <p style={styles.hint}>{hint}</p> : null}
      <div style={styles.frame}>
        <div style={styles.fadeTop} aria-hidden />
        <div style={styles.centerBand} aria-hidden />
        <div style={styles.fadeBottom} aria-hidden />
        <div
          ref={listRef}
          data-number-scroller
          role="listbox"
          aria-label={label}
          tabIndex={0}
          style={styles.list}
          onScroll={() => {
            if (settlingRef.current) return
            const el = listRef.current
            if (!el) return
            const index = Math.round(el.scrollTop / ITEM_HEIGHT)
            const clamped = Math.max(0, Math.min(options.length - 1, index))
            const next = options[clamped]
            if (next != null) commitValue(next)
          }}
          onTouchEnd={commitFromScroll}
          onMouseUp={commitFromScroll}
          onBlur={commitFromScroll}
        >
          <div style={{ height: ITEM_HEIGHT * 2 }} aria-hidden />
          {options.map((n) => {
            const isSelected = selected === n
            return (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  commitValue(n)
                  scrollToValue(n, 'smooth')
                }}
                style={{
                  ...styles.item,
                  ...(isSelected ? styles.itemSelected : {}),
                }}
              >
                {range.unit === '₹' ? n.toLocaleString('en-IN') : n}
              </button>
            )
          })}
          <div style={{ height: ITEM_HEIGHT * 2 }} aria-hidden />
        </div>
      </div>
      {!selected && required ? (
        <p style={styles.prompt}>Scroll the wheel and stop on your number.</p>
      ) : null}
    </div>
  )
}

/** Alias for body-tape fields — same scroll wheel. */
export function MeasurementScroller(
  props: Omit<NumberScrollerBaseProps, 'min' | 'max' | 'step'> & {
    kind: Extract<NumberScrollerPreset, 'chest' | 'thigh' | 'navel' | 'weight'>
  }
) {
  const { kind, ...rest } = props
  return <NumberScroller {...rest} preset={kind} />
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'grid',
    gap: 8,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: colors.textSecondary,
  },
  value: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.accent,
    fontVariantNumeric: 'tabular-nums',
  },
  hint: {
    margin: 0,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
  frame: {
    position: 'relative',
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    borderRadius: radius.md,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  list: {
    height: '100%',
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    WebkitOverflowScrolling: 'touch',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  item: {
    height: ITEM_HEIGHT,
    width: '100%',
    border: 0,
    background: 'transparent',
    color: colors.textMuted,
    fontSize: 18,
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
    scrollSnapAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  itemSelected: {
    color: colors.textPrimary,
    fontWeight: 700,
    fontSize: 22,
  },
  centerBand: {
    position: 'absolute',
    left: spacing[2],
    right: spacing[2],
    top: '50%',
    height: ITEM_HEIGHT,
    marginTop: -(ITEM_HEIGHT / 2),
    borderRadius: radius.sm,
    border: `1px solid ${colors.accent}`,
    backgroundColor: colors.accentMuted,
    pointerEvents: 'none',
    zIndex: 1,
  },
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_HEIGHT * 2,
    background: `linear-gradient(to bottom, ${colors.bgElevated}, transparent)`,
    pointerEvents: 'none',
    zIndex: 2,
  },
  fadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_HEIGHT * 2,
    background: `linear-gradient(to top, ${colors.bgElevated}, transparent)`,
    pointerEvents: 'none',
    zIndex: 2,
  },
  prompt: {
    margin: 0,
    fontSize: 12,
    color: colors.textMuted,
  },
}
