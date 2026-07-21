'use client'

import { useId, useState, type CSSProperties } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  MAX_HEIGHT_CM,
  MIN_HEIGHT_CM,
  cmToFeetInches,
  feetInchesToCm,
  normalizeFeetInches,
  parseHeightCm,
  validateHeightCm,
} from '@/lib/height'

type HeightUnit = 'cm' | 'imperial'

type HeightInputProps = {
  value: string
  onChange: (heightCm: string) => void
  label?: string
  required?: boolean
  disabled?: boolean
  inputStyle?: CSSProperties
  fieldStyle?: CSSProperties
}

function imperialHeightToStoredCm(feet: number, inches: number): number {
  const converted = feetInchesToCm(feet, inches)
  // Whole-inch imperial values nearest the accepted metric boundaries round
  // to 119 cm and 231 cm. Keep those boundary representations valid.
  if (converted === MIN_HEIGHT_CM - 1) return MIN_HEIGHT_CM
  if (converted === MAX_HEIGHT_CM + 1) return MAX_HEIGHT_CM
  return converted
}

export function HeightInput({
  value,
  onChange,
  label = 'Height',
  required = false,
  disabled = false,
  inputStyle,
  fieldStyle,
}: HeightInputProps) {
  const id = useId()
  const [unit, setUnit] = useState<HeightUnit>('cm')
  const initialImperial = cmToFeetInches(parseHeightCm(value) ?? 0)
  const [feet, setFeet] = useState(initialImperial.feet ? String(initialImperial.feet) : '')
  const [inches, setInches] = useState(initialImperial.feet ? String(initialImperial.inches) : '')

  const selectUnit = (nextUnit: HeightUnit) => {
    if (nextUnit === unit) return
    if (nextUnit === 'imperial') {
      const converted = cmToFeetInches(parseHeightCm(value) ?? 0)
      setFeet(converted.feet ? String(converted.feet) : '')
      setInches(converted.feet ? String(converted.inches) : '')
    }
    setUnit(nextUnit)
  }

  const updateImperial = (nextFeet: string, nextInches: string) => {
    setFeet(nextFeet)
    setInches(nextInches)
    if (nextFeet === '' && nextInches === '') {
      onChange('')
      return
    }
    const feetValue = Number(nextFeet || 0)
    const inchesValue = Number(nextInches || 0)
    if (Number.isFinite(feetValue) && Number.isFinite(inchesValue)) {
      onChange(String(imperialHeightToStoredCm(feetValue, inchesValue)))
    }
  }

  const normalizeImperialInputs = () => {
    if (feet === '' && inches === '') return
    const normalized = normalizeFeetInches(Number(feet || 0), Number(inches || 0))
    setFeet(String(normalized.feet))
    setInches(String(normalized.inches))
    onChange(String(imperialHeightToStoredCm(normalized.feet, normalized.inches)))
  }

  const validationError = value ? validateHeightCm(value) : null

  return (
    <fieldset style={{ ...styles.fieldset, ...fieldStyle }} disabled={disabled}>
      <legend style={styles.label}>
        {label}{required ? ' *' : ''}
      </legend>
      <div style={styles.unitGroup} aria-label="Height unit">
        <button type="button" onClick={() => selectUnit('cm')} aria-pressed={unit === 'cm'} style={{ ...styles.unitButton, ...(unit === 'cm' ? styles.unitButtonActive : {}) }}>
          Centimeters
        </button>
        <button type="button" onClick={() => selectUnit('imperial')} aria-pressed={unit === 'imperial'} style={{ ...styles.unitButton, ...(unit === 'imperial' ? styles.unitButtonActive : {}) }}>
          Feet & inches
        </button>
      </div>

      {unit === 'cm' ? (
        <div style={styles.inputWrap}>
          <input
            id={`${id}-cm`}
            type="number"
            inputMode="numeric"
            min={MIN_HEIGHT_CM}
            max={MAX_HEIGHT_CM}
            step={1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              const heightCm = parseHeightCm(value)
              if (heightCm != null) onChange(String(heightCm))
            }}
            required={required}
            aria-describedby={`${id}-hint`}
            aria-invalid={Boolean(validationError)}
            style={{ ...styles.input, ...inputStyle }}
          />
          <span style={styles.suffix}>cm</span>
        </div>
      ) : (
        <div style={styles.imperialGrid}>
          <label style={styles.subLabel}>
            Feet
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={feet}
              onChange={(event) => updateImperial(event.target.value, inches)}
              onBlur={normalizeImperialInputs}
              required={required}
              aria-describedby={`${id}-hint`}
              aria-invalid={Boolean(validationError)}
              style={{ ...styles.input, ...inputStyle }}
            />
          </label>
          <label style={styles.subLabel}>
            Inches
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={inches}
              onChange={(event) => updateImperial(feet, event.target.value)}
              onBlur={normalizeImperialInputs}
              required={required}
              aria-describedby={`${id}-hint`}
              aria-invalid={Boolean(validationError)}
              style={{ ...styles.input, ...inputStyle }}
            />
          </label>
        </div>
      )}
      <p id={`${id}-hint`} style={{ ...styles.hint, ...(validationError ? styles.error : {}) }} aria-live="polite">
        {validationError ?? `Accepted range: ${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} cm.`}
      </p>
    </fieldset>
  )
}

const styles: Record<string, CSSProperties> = {
  fieldset: { border: 0, padding: 0, margin: `0 0 ${spacing[3]}px`, minWidth: 0 },
  label: { padding: 0, marginBottom: spacing[1], fontSize: 14, fontWeight: 500, color: colors.textSecondary },
  unitGroup: { display: 'flex', gap: 8, marginBottom: spacing[2] },
  unitButton: {
    minHeight: 40,
    padding: '8px 12px',
    borderRadius: radius.full,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    color: colors.textSecondary,
    cursor: 'pointer',
    fontSize: 13,
  },
  unitButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted, color: colors.accent, fontWeight: 600 },
  inputWrap: { position: 'relative' },
  input: {
    width: '100%',
    minHeight: 56,
    padding: `${spacing[2]}px ${spacing[3]}px`,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.sm,
    boxSizing: 'border-box',
    fontSize: 16,
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
  },
  suffix: { position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted, pointerEvents: 'none' },
  imperialGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing[2] },
  subLabel: { display: 'grid', gap: 6, fontSize: 13, color: colors.textMuted },
  hint: { margin: '6px 0 0', fontSize: 12, color: colors.textMuted },
  error: { color: colors.danger },
}
