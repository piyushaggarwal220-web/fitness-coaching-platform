'use client'

import { useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { requestComplexityRecalculation } from '@/lib/complexity/client'
import { evaluateComplexityInputs } from '@/lib/complexity/input-guards'
import { FITNESS_GOAL_OPTIONS } from '@/lib/onboarding'
import { colors } from '@/lib/coach-theme'
import { coachPageStyles as pageStyles } from '@/lib/coach-page-styles'
import { HeightInput } from '@/components/ui/HeightInput'
import { NumberScroller } from '@/components/ui/MeasurementScroller'
import { parseHeightCm, validateHeightCm } from '@/lib/height'
import type { CoachClientDetail } from '@/types/database'

type CoachClientProfileEditProps = {
  client: CoachClientDetail
  onSaved: (updated: CoachClientDetail) => void
  trigger?: 'profile_edit_coach' | 'profile_edit_admin'
}

const supabase = createClient()

export function CoachClientProfileEdit({ client, onSaved, trigger = 'profile_edit_coach' }: CoachClientProfileEditProps) {
  const [age, setAge] = useState(client.age != null ? String(client.age) : '')
  const [weight, setWeight] = useState(client.weight != null ? String(client.weight) : '')
  const [height, setHeight] = useState(client.height != null ? String(client.height) : '')
  const [fitnessGoal, setFitnessGoal] = useState(client.fitness_goal ?? '')
  const [phone, setPhone] = useState(client.phone ?? '')
  const [injuries, setInjuries] = useState(client.injuries ?? '')
  const [medicalNotes, setMedicalNotes] = useState(client.medical_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    const nextAge = age ? Number(age) : null
    const nextWeight = weight ? Number(weight) : null
    const heightError = validateHeightCm(height)
    if (heightError) {
      setMessage(heightError)
      setSaving(false)
      return
    }
    const nextHeight = parseHeightCm(height)
    const guard = evaluateComplexityInputs(
      {
        age: nextAge,
        weight: nextWeight,
        height: nextHeight,
        fitnessGoal,
        injuries: injuries.trim() || null,
        medicalNotes: medicalNotes.trim() || null,
      },
      {
        previousDisplayScore:
          typeof client.complexity_score === 'number' ? client.complexity_score : null,
      }
    )

    const { error } = await supabase
      .from('profiles')
      .update({
        age: nextAge,
        weight: nextWeight,
        height: nextHeight,
        fitness_goal: fitnessGoal || null,
        phone: phone.trim() || null,
        injuries: injuries.trim() || null,
        medical_notes: medicalNotes.trim() || null,
        complexity_input_needs_review: false,
        complexity_input_review_reasons: [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', client.id)

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    await requestComplexityRecalculation({
      clientId: client.id,
      trigger,
    })

    setHeight(String(nextHeight))
    onSaved({
      ...client,
      age,
      weight,
      height: String(nextHeight),
      fitness_goal: fitnessGoal,
      phone: phone.trim() || null,
      injuries: injuries.trim() || null,
      medical_notes: medicalNotes.trim() || null,
      complexity_input_needs_review: false,
      complexity_input_review_reasons: [],
    })
    setMessage(
      guard.needsReview
        ? 'Profile updated and acknowledged by coach. Complexity score recalculated — double-check metrics if drafts look off.'
        : 'Profile updated. Complexity score recalculated.'
    )
    setSaving(false)
  }

  return (
    <div style={styles.wrap}>
      <h3 style={styles.title}>Update client metrics</h3>
      <p style={styles.hint}>Changes recalculate the complexity score automatically.</p>
      <div style={styles.grid}>
        <label style={styles.field}>
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={pageStyles.input}
            type="tel"
            placeholder="+91 98765 43210"
          />
        </label>
        <div style={styles.field}>
          <NumberScroller
            label="Age"
            preset="age"
            value={age}
            onChange={setAge}
          />
        </div>
        <div style={styles.field}>
          <NumberScroller
            label="Weight"
            preset="weight"
            value={weight}
            onChange={setWeight}
          />
        </div>
        <HeightInput
          value={height}
          onChange={setHeight}
          required
          fieldStyle={styles.heightField}
          inputStyle={pageStyles.input}
        />
        <label style={styles.field}>
          Fitness goal
          <select value={fitnessGoal} onChange={(e) => setFitnessGoal(e.target.value)} style={pageStyles.input}>
            <option value="">—</option>
            {FITNESS_GOAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={styles.field}>
        Injuries
        <textarea value={injuries} onChange={(e) => setInjuries(e.target.value)} rows={2} style={pageStyles.textarea} />
      </label>
      <label style={styles.field}>
        Medical notes
        <textarea value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} rows={2} style={pageStyles.textarea} />
      </label>
      <button type="button" onClick={() => void handleSave()} disabled={saving} style={pageStyles.primaryBtn}>
        {saving ? 'Saving…' : 'Save & recalculate complexity'}
      </button>
      {message && <p style={styles.message}>{message}</p>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { marginTop: 8 },
  title: { margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, color: colors.textPrimary },
  hint: { margin: '0 0 16px 0', fontSize: 13, color: colors.textSecondary },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 },
  field: { display: 'grid', gap: 6, fontSize: 14, color: colors.textSecondary },
  heightField: { gridColumn: '1 / -1', marginBottom: 0 },
  message: { marginTop: 12, fontSize: 13, color: colors.success },
}
