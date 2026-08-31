'use client'

import { useState } from 'react'
import { GenerationStatus } from '@/components/coach/ai-actions/shared'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import { Button } from '@/components/ui/Button'
import { colors, spacing } from '@/lib/coach-theme'
import type { PlanFormData } from '@/types/database'

type Props = {
  clientId: string
  open: boolean
  onClose: () => void
  onApply: (patch: Partial<PlanFormData>) => void
}

export function PlanRemakeAiModal({ clientId, open, onClose, onApply }: Props) {
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

  const generate = async (instruction?: string) => {
    setGenerating(true)
    setStatusVariant('loading')
    setStatus('Remaking full plan from scratch — diet, workout, cardio, and supplements. This may take a few minutes.')
    try {
      const res = await fetch('/api/coach/remake-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          coachInstruction: instruction?.trim() || undefined,
        }),
      })
      const data = (await res.json()) as {
        success?: boolean
        formData?: PlanFormData
        error?: string
      }
      if (!res.ok || !data.success || !data.formData) {
        throw new Error(data.error ?? 'Plan remake failed')
      }
      onApply({
        nutrition_plan: data.formData.nutrition_plan,
        workout_plan: data.formData.workout_plan,
        cardio_plan: data.formData.cardio_plan,
        supplement_plan: data.formData.supplement_plan,
        coach_notes: data.formData.coach_notes,
      })
      setStatusVariant('success')
      setStatus('New plan applied to the editor. Review, then save or deliver.')
      setTimeout(resetAndClose, 800)
    } catch (err) {
      setStatusVariant('error')
      setStatus(err instanceof Error ? err.message : 'Plan remake failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-remake-plan-title"
      style={s.drawerOverlay}
      onClick={resetAndClose}
    >
      <div style={s.drawer} onClick={(e) => e.stopPropagation()}>
        <h2 id="ai-remake-plan-title" style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>
          Remake entire plan with AI
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          Starts completely fresh from the client&apos;s profile — ignores the current draft.
          Calorie rules (maintenance-level food, high flux pairing) apply automatically; optional notes steer style only.
        </p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          Optional notes
        </label>
        <textarea
          value={coachInstruction}
          onChange={(e) => setCoachInstruction(e.target.value)}
          rows={4}
          placeholder="e.g. Higher calories at maintenance, Indian vegetarian meals, 4-day upper/lower split…"
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
          <Button
            variant="primary"
            disabled={generating}
            onClick={() => void generate(coachInstruction)}
            style={{ flex: '1 1 160px' }}
          >
            {generating ? 'Remaking plan…' : 'Remake full plan'}
          </Button>
          <Button
            variant="secondary"
            disabled={generating}
            onClick={() => void generate('')}
            style={{ flex: '1 1 160px' }}
          >
            Remake with no notes
          </Button>
          <Button variant="ghost" disabled={generating} onClick={resetAndClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
