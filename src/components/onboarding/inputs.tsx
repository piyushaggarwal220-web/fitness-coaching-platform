import { onboardingStyles as s } from './styles'

type FieldProps = {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}

export function Field({ label, required, hint, children }: FieldProps) {
  return (
    <div style={s.field}>
      <label style={s.label}>
        {label}
        {required ? ' *' : ''}
      </label>
      {hint && <p style={{ ...s.stepHint, marginTop: -4, marginBottom: 10 }}>{hint}</p>}
      {children}
    </div>
  )
}

type ChipGroupProps = {
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  columns?: 1 | 2
}

export function ChipGroup({ options, value, onChange }: ChipGroupProps) {
  return (
    <div style={s.chipGrid}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{ ...s.chip, ...(selected ? s.chipSelected : {}) }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

type MultiChipGroupProps = {
  options: readonly { value: string; label: string }[]
  values: string[]
  onChange: (values: string[]) => void
}

export function MultiChipGroup({ options, values, onChange }: MultiChipGroupProps) {
  const toggle = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val))
    } else {
      onChange([...values, val])
    }
  }

  return (
    <div style={s.chipGrid}>
      {options.map((option) => {
        const selected = values.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            style={{ ...s.chip, ...(selected ? s.chipSelected : {}) }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

type RadioCardsProps = {
  name: string
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}

export function RadioCards({ name, options, value, onChange }: RadioCardsProps) {
  return (
    <div style={s.radioGrid}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <label
            key={option.value}
            style={{ ...s.radioCard, ...(selected ? s.radioCardSelected : {}) }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}
