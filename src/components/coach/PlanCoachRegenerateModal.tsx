'use client'

import { useState } from 'react'
import { GenerationStatus } from '@/components/coach/ai-actions/shared'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import { Button } from '@/components/ui/Button'
import { colors, spacing } from '@/lib/coach-theme'
import type { PlanFormData } from '@/types/database'

type Props = {
  clientId: string
  nutritionPlan: string
  workoutPlan: string
  open: boolean
  onClose: () => void
  onApply: (patch: Partial<PlanFormData>) => void
}

export function PlanCoachRegenerateModal({
  clientId,
  nutritionPlan,
  workoutPlan,
  open,
  onClose,
  onApply,
}: Props) {
  const [coachInstruction, setCoachInstruction] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [statusVariant, setStatusVariant] = useState<'loading' | 'success' | 'error'>('loading')
  const [generating, setGenerating] = useState(false)

  if (!open) return null

  const resetAndClose = () => {
    setCoachInstruction('')
    setStatus(null)
    setGenerating(false)
    onClose()
  }

  const generate = async () => {
    setGenerating(true)
    setStatusVariant('loading')
    setStatus(
      'Regenerating diet and workout using profile-calculated maintenance and calorie targets. This may take a few minutes.'
    )
    try {
      const res = await fetch('/api/coach/regenerate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          coachInstruction: coachInstruction.trim() || undefined,
          nutrition_plan: nutritionPlan,
          workout_plan: workoutPlan,
        }),
      })
      const data = (await res.json()) as {
        success?: boolean
        formData?: Pick<PlanFormData, 'nutrition_plan' | 'workout_plan'>
        error?: string
      }
      if (!res.ok || !data.success || !data.formData) {
        throw new Error(data.error ?? 'Plan regeneration failed')
      }
      onApply(data.formData)
      setStatusVariant('success')
      setStatus('Updated plan applied to the editor. Review, then save or deliver.')
      setTimeout(resetAndClose, 800)
    } catch (err) {
      setStatusVariant('error')
      setStatus(err instanceof Error ? err.message : 'Plan regeneration failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-regen-plan-title"
      style={s.drawerOverlay}
      onClick={resetAndClose}
    >
      <div style={s.drawer} onClick={(e) => e.stopPropagation()}>
        <h2 id="ai-regen-plan-title" style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>
          Regenerate plan from profile
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          Maintenance and daily calories are calculated automatically from the client&apos;s weight,
          height, age, activity, training days, and goal. No calorie notes needed — optional notes
          below only steer meal style or priorities.
        </p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          Optional notes
        </label>
        <textarea
          value={coachInstruction}
          onChange={(e) => setCoachInstruction(e.target.value)}
          rows={4}
          placeholder="e.g. Keep Indian vegetarian meals, same 6-day split…"
          disabled={generating}
          style={{
            ...s.noteInput,
            minHeight: 96,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        <GenerationStatus message={status} variant={statusVariant} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: spacing[2] }}>
          <Button variant="primary" disabled={generating} onClick={() => void generate()} style={{ flex: '1 1 160px' }}>
            {generating ? 'Regenerating…' : 'Regenerate plan'}
          </Button>
          <Button variant="ghost" disabled={generating} onClick={resetAndClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
