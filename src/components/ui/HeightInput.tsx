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
import { NumberScroller } from '@/components/ui/MeasurementScroller'

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
      const normalized = normalizeFeetInches(feetValue, inchesValue)
      onChange(String(imperialHeightToStoredCm(normalized.feet, normalized.inches)))
    }
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
        <NumberScroller
          label="Centimeters"
          preset="height"
          value={value}
          onChange={onChange}
          required={required}
        />
      ) : (
        <div style={styles.imperialGrid}>
          <NumberScroller
            label="Feet"
            preset="feet"
            value={feet}
            onChange={(next) => updateImperial(next, inches || '0')}
            required={required}
          />
          <NumberScroller
            label="Inches"
            preset="inches"
            value={inches}
            onChange={(next) => updateImperial(feet || '0', next)}
            required={required}
          />
        </div>
      )}
      <p id={`${id}-hint`} style={{ ...styles.hint, ...(validationError ? styles.error : {}) }} aria-live="polite">
        {validationError ?? 'Scroll the wheel — no typing needed.'}
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
  imperialGrid: { display: 'grid', gap: spacing[3] },
  hint: { margin: '6px 0 0', fontSize: 12, color: colors.textMuted },
  error: { color: colors.danger },
}
