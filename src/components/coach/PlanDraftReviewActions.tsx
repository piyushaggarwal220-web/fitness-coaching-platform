'use client'

import { useState } from 'react'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import { colors, spacing } from '@/lib/coach-theme'
import { PlanCoachRegenerateModal } from '@/components/coach/PlanCoachRegenerateModal'
import { PlanRemakeAiModal } from '@/components/coach/PlanRemakeAiModal'
import type { PlanFormData } from '@/types/database'

type Props = {
  clientId: string
  form: PlanFormData
  onFormPatch: (patch: Partial<PlanFormData>) => void
  /** Open a modal once on mount (from ?regen=1 or ?remake=1). */
  initialAction?: 'regen' | 'remake' | null
  onInitialActionConsumed?: () => void
  compact?: boolean
}

export function PlanDraftReviewActions({
  clientId,
  form,
  onFormPatch,
  initialAction = null,
  onInitialActionConsumed,
  compact = false,
}: Props) {
  const [regenOpen, setRegenOpen] = useState(initialAction === 'regen')
  const [remakeOpen, setRemakeOpen] = useState(initialAction === 'remake')

  const openRegen = () => {
    setRemakeOpen(false)
    setRegenOpen(true)
  }

  const openRemake = () => {
    setRegenOpen(false)
    setRemakeOpen(true)
  }

  const closeRegen = () => {
    setRegenOpen(false)
    onInitialActionConsumed?.()
  }

  const closeRemake = () => {
    setRemakeOpen(false)
    onInitialActionConsumed?.()
  }

  const wrapStyle = compact
    ? { display: 'flex' as const, flexWrap: 'wrap' as const, gap: 10, marginTop: 10 }
    : {
        ...s.card,
        borderColor: colors.accent,
        backgroundColor: colors.accentMuted,
        marginBottom: spacing[3],
      }

  return (
    <>
      <div style={wrapStyle}>
        {!compact && (
          <>
            <strong style={{ display: 'block', marginBottom: 6 }}>Ready for coach note/review</strong>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textSecondary, lineHeight: 1.45 }}>
              Draft looks off? Regenerate from your coaching instruction, or remake everything from
              scratch. Then add your client-facing coach note and deliver.
            </p>
          </>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" style={s.noteToggle} onClick={openRegen}>
            Regenerate with coach instruction
          </button>
          <button type="button" style={s.noteToggle} onClick={openRemake}>
            Remake from scratch
          </button>
        </div>
      </div>

      {regenOpen && (
        <PlanCoachRegenerateModal
          clientId={clientId}
          nutritionPlan={form.nutrition_plan}
          workoutPlan={form.workout_plan}
          open
          onClose={closeRegen}
          onApply={(patch) => {
            onFormPatch(patch)
            closeRegen()
          }}
        />
      )}

      {remakeOpen && (
        <PlanRemakeAiModal
          clientId={clientId}
          open
          onClose={closeRemake}
          onApply={(patch) => {
            onFormPatch(patch)
            closeRemake()
          }}
        />
      )}
    </>
  )
}
