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
 onBack: () => void
 saving: boolean
 error?: string
 styles: Record<string, CSSProperties>
 dig: (base: CSSProperties, key?: string) => CSSProperties
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
 <>
 <button type="button" onClick={onBack} style={dig(styles.backToDetails, 'backLink')}>
 {'← Back to plan'}
 </button>

 <h2 style={dig(styles.sectionLabel, 'sectionLabel')}>A few basics for your coach</h2>
 <p style={dig(styles.otpHint ?? { margin: '0 0 16px', fontSize: 14, lineHeight: 1.45 }, 'otpHint')}>
 This starts your intake (~30 seconds). Your full customized diet, workout, cardio, and sleep
 guidance come after purchase and the detailed questions.
 </p>

 {error ? <div style={styles.error ?? { color: '#b91c1c', marginBottom: 12 }}>{error}</div> : null}

 <div style={styles.form}>
 <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-age">
 Age
 </label>
 <input
 id="checkout-basics-age"
 inputMode="numeric"
 value={value.age}
 onChange={(e) => set('age', e.target.value.replace(/\D/g, '').slice(0, 3))}
 placeholder="e.g. 28"
 style={dig(styles.input, 'input')}
 />

 <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-gender">
 Gender
 </label>
 <select
 id="checkout-basics-gender"
 value={value.gender}
 onChange={(e) => set('gender', e.target.value)}
 style={dig(styles.input, 'input')}
 >
 <option value="">Select</option>
 {CHECKOUT_BASICS_GENDER_OPTIONS.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>

 <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-height">
 Height (cm)
 </label>
 <input
 id="checkout-basics-height"
 inputMode="decimal"
 value={value.heightCm}
 onChange={(e) => set('heightCm', e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
 placeholder="e.g. 172"
 style={dig(styles.input, 'input')}
 />

 <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-weight">
 Weight (kg) Â· optional
 </label>
 <input
 id="checkout-basics-weight"
 inputMode="decimal"
 value={value.weightKg}
 onChange={(e) => set('weightKg', e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
 placeholder="e.g. 70"
 style={dig(styles.input, 'input')}
 />

 <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-diet">
 Diet type
 </label>
 <select
 id="checkout-basics-diet"
 value={value.dietPreference}
 onChange={(e) => set('dietPreference', e.target.value)}
 style={dig(styles.input, 'input')}
 >
 <option value="">Select</option>
 {CHECKOUT_BASICS_DIET_OPTIONS.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>

 <label style={dig(styles.label, 'label')} htmlFor="checkout-basics-goal">
 Main goal
 </label>
 <select
 id="checkout-basics-goal"
 value={value.mainGoal}
 onChange={(e) => set('mainGoal', e.target.value)}
 style={dig(styles.input, 'input')}
 >
 <option value="">Select</option>
 {CHECKOUT_MAIN_GOAL_OPTIONS.map((option) => (
 <option key={option.value} value={option.value}>
 {option.label}
 </option>
 ))}
 </select>

 <button
 type="button"
 style={dig(styles.payBtn, 'payBtn')}
 disabled={saving}
 onClick={onSubmit}
 >
 {saving ? 'Saving...' : 'Continue'}
 </button>
 <p style={dig(styles.otpHint ?? { marginTop: 12, fontSize: 13 }, 'otpHint')}>
 Next: unlock your full customized plan.
 </p>
 </div>
 </>
 )
}
