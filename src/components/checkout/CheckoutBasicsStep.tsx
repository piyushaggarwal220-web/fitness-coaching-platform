'use client'

import type { CSSProperties } from 'react'
import {
  CHECKOUT_BASICS_DIET_OPTIONS,
  CHECKOUT_BASICS_GENDER_OPTIONS,
  CHECKOUT_MAIN_GOAL_OPTIONS,
} from '@/lib/payments/checkout-intake-basics-shared'

export type CheckoutBasicsFormState = {
  age: string
  gender: string
  heightCm: string
  weightKg: string
  dietPreference: string
  mainGoal: string
}

type Props = {
  value: CheckoutBasicsFormState
  onChange: (next: CheckoutBasicsFormState) => void
  onSubmit: () => void
  onBack?: () => void
  saving: boolean
  error?: string
  styles: Record<string, CSSProperties>
  dig: (base: CSSProperties, key?: string) => CSSProperties
}

const wrap: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  overflowX: 'hidden',
  boxSizing: 'border-box',
}

const metricsRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginBottom: 4,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 18,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
}

const chipBase: CSSProperties = {
  borderRadius: 999,
  border: '1px solid rgba(251, 191, 36, 0.28)',
  background: '#12100f',
  color: '#e2e8f0',
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: 42,
  maxWidth: '100%',
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
}

const chipActive: CSSProperties = {
  ...chipBase,
  background: 'rgba(34, 197, 94, 0.16)',
  border: '1px solid #22c55e',
  color: '#f8fafc',
}

const field: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  minHeight: 48,
  borderRadius: 12,
  border: '1px solid rgba(251, 191, 36, 0.28)',
  background: '#12100f',
  color: '#f8fafc',
  padding: '12px 14px',
  fontSize: 16,
  marginBottom: 16,
}

export function CheckoutBasicsStep({
  value,
  onChange,
  onSubmit,
  onBack,
  saving,
  error,
  styles,
  dig,
}: Props) {
  const set = <K extends keyof CheckoutBasicsFormState>(key: K, next: CheckoutBasicsFormState[K]) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <div style={wrap}>
      {onBack ? (
        <button type="button" onClick={onBack} style={dig(styles.backToDetails, 'backLink')}>
          {'<- Back to plan'}
        </button>
      ) : null}

      {error ? (
        <div style={{ ...styles.error, marginBottom: 14, wordBreak: 'break-word' }}>{error}</div>
      ) : null}

      <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-age">
        Age
      </label>
      <input
        id="checkout-basics-age"
        inputMode="numeric"
        value={value.age}
        onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
        placeholder="e.g. 28"
        style={{ ...dig(styles.input, 'input'), ...field }}
      />

      <p style={dig(styles.label, 'label')}>Gender</p>
      <div style={chipRow} role="group" aria-label="Gender">
        {CHECKOUT_BASICS_GENDER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => set('gender', option.value)}
            style={value.gender === option.value ? chipActive : chipBase}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div style={metricsRow}>
        <div style={{ minWidth: 0 }}>
          <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-height">
            Height (cm)
          </label>
          <input
            id="checkout-basics-height"
            inputMode="decimal"
            value={value.heightCm}
            onChange={(e) => set('heightCm', e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
            placeholder="172"
            style={{ ...dig(styles.input, 'input'), ...field, marginBottom: 16 }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-weight">
            Weight (kg)
          </label>
          <input
            id="checkout-basics-weight"
            inputMode="decimal"
            value={value.weightKg}
            onChange={(e) => set('weightKg', e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
            placeholder="Optional"
            style={{ ...dig(styles.input, 'input'), ...field, marginBottom: 16 }}
          />
        </div>
      </div>

      <p style={dig(styles.label, 'label')}>Diet type</p>
      <div style={chipRow} role="group" aria-label="Diet type">
        {CHECKOUT_BASICS_DIET_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => set('dietPreference', option.value)}
            style={value.dietPreference === option.value ? chipActive : chipBase}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p style={dig(styles.label, 'label')}>Main goal</p>
      <div style={chipRow} role="group" aria-label="Main goal">
        {CHECKOUT_MAIN_GOAL_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => set('mainGoal', option.value)}
            style={value.mainGoal === option.value ? chipActive : chipBase}
          >
            {option.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        style={{ ...dig(styles.payBtn, 'payBtn'), width: '100%', marginTop: 8 }}
        disabled={saving}
        onClick={onSubmit}
      >
        {saving ? 'Saving...' : 'Continue'}
      </button>
    </div>
  )
}
