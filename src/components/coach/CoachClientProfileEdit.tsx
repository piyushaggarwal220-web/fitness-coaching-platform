'use client'

import { useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { requestComplexityRecalculation } from '@/lib/complexity/client'
import { FITNESS_GOAL_OPTIONS } from '@/lib/onboarding'
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
  const [injuries, setInjuries] = useState(client.injuries ?? '')
  const [medicalNotes, setMedicalNotes] = useState(client.medical_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({
        age: age ? Number(age) : null,
        weight: weight ? Number(weight) : null,
        height: height ? Number(height) : null,
        fitness_goal: fitnessGoal || null,
        injuries: injuries.trim() || null,
        medical_notes: medicalNotes.trim() || null,
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

    onSaved({
      ...client,
      age,
      weight,
      height,
      fitness_goal: fitnessGoal,
      injuries: injuries.trim() || null,
      medical_notes: medicalNotes.trim() || null,
    })
    setMessage('Profile updated. Complexity score recalculated.')
    setSaving(false)
  }

  return (
    <div style={styles.wrap}>
      <h3 style={styles.title}>Update client metrics</h3>
      <p style={styles.hint}>Changes recalculate the complexity score automatically.</p>
      <div style={styles.grid}>
        <label style={styles.field}>
          Age
          <input value={age} onChange={(e) => setAge(e.target.value)} style={styles.input} type="number" />
        </label>
        <label style={styles.field}>
          Weight (kg)
          <input value={weight} onChange={(e) => setWeight(e.target.value)} style={styles.input} type="number" />
        </label>
        <label style={styles.field}>
          Height (cm)
          <input value={height} onChange={(e) => setHeight(e.target.value)} style={styles.input} type="number" />
        </label>
        <label style={styles.field}>
          Fitness goal
          <select value={fitnessGoal} onChange={(e) => setFitnessGoal(e.target.value)} style={styles.input}>
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
        <textarea value={injuries} onChange={(e) => setInjuries(e.target.value)} rows={2} style={styles.textarea} />
      </label>
      <label style={styles.field}>
        Medical notes
        <textarea value={medicalNotes} onChange={(e) => setMedicalNotes(e.target.value)} rows={2} style={styles.textarea} />
      </label>
      <button type="button" onClick={() => void handleSave()} disabled={saving} style={styles.btn}>
        {saving ? 'Saving…' : 'Save & recalculate complexity'}
      </button>
      {message && <p style={styles.message}>{message}</p>}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { marginTop: 8 },
  title: { margin: '0 0 8px 0', fontSize: 16, fontWeight: 600 },
  hint: { margin: '0 0 16px 0', fontSize: 13, color: '#666' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 },
  field: { display: 'grid', gap: 6, fontSize: 14 },
  input: { padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 15 },
  textarea: { padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 15, fontFamily: 'inherit' },
  btn: {
    marginTop: 12,
    padding: '10px 16px',
    backgroundColor: '#1a1a2e',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
  },
  message: { marginTop: 12, fontSize: 13, color: '#155724' },
}
