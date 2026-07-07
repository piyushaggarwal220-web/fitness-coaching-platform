'use client'

import type { AiReasoningDisplay, CoachAiActionDefinition } from '@/lib/coach/ai-actions'
import { WEEKLY_COACHING_ACTIONS, mergePlanForms } from '@/lib/coach/ai-actions'
import { runCoachAiAction } from '@/lib/coach/ai-action-client'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import {
  saveAiReasoningToSession,
  savePlanDraftToSession,
  saveWorkoutRetryError,
} from '@/lib/ai/plan-format'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AiReasoningPanel, ActionCard, GenerationStatus, OptionalCoachNote } from './shared'
import { aiActionStyles as s } from './styles'

type WeeklyCoachingPanelProps = {
  clientId: string
  checkinId: string
}

export function WeeklyCoachingPanel({
  clientId,
  checkinId,
}: WeeklyCoachingPanelProps) {
  const router = useRouter()
  const [coachNote, setCoachNote] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<CoachAiActionId | null>(null)
  const [reasoning, setReasoning] = useState<AiReasoningDisplay | null>(null)

  const dietAction = WEEKLY_COACHING_ACTIONS.find((action) => action.id === 'review_update_diet')!
  const workoutAction = WEEKLY_COACHING_ACTIONS.find((action) => action.id === 'review_update_workout')!

  const runAction = async (action: CoachAiActionDefinition) => {
    setBusy(action.id)
    setError('')
    setStatus(`Running ${action.label.toLowerCase()}…`)

    const result = await runCoachAiAction({
      action: action.id,
      clientId,
      checkinId,
      coachNote,
    })

    setBusy(null)
    setStatus(null)

    if (!result.success) {
      setError(result.error ?? 'Action failed.')
      return
    }

    if (result.aiReasoning) {
      setReasoning(result.aiReasoning)
      saveAiReasoningToSession(clientId, result.aiReasoning)
    }

    if (result.formData) {
      savePlanDraftToSession(clientId, result.formData)
      router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1`)
    }
  }

  const runWeeklyUpdate = async () => {
    setBusy('review_update_diet')
    setError('')
    setStatus('Generating updated diet from active plan and check-in...')

    const dietResult = await runCoachAiAction({
      action: 'review_update_diet',
      clientId,
      checkinId,
      coachNote,
    })

    if (!dietResult.success || !dietResult.formData) {
      setBusy(null)
      setStatus(null)
      setError(dietResult.error ?? 'Diet update failed.')
      return
    }

    if (dietResult.aiReasoning) {
      setReasoning(dietResult.aiReasoning)
      saveAiReasoningToSession(clientId, dietResult.aiReasoning)
    }

    setBusy('review_update_workout')
    setStatus('Diet ready. Generating updated workout with the updated diet context...')

    const workoutResult = await runCoachAiAction({
      action: 'review_update_workout',
      clientId,
      checkinId,
      coachNote,
      draftPlanContext: dietResult.formData,
    })

    setBusy(null)
    setStatus(null)

    if (!workoutResult.success || !workoutResult.formData) {
      savePlanDraftToSession(clientId, dietResult.formData)
      saveWorkoutRetryError(clientId, workoutResult.error ?? 'Workout update failed after diet update.')
      if (dietResult.aiReasoning) saveAiReasoningToSession(clientId, dietResult.aiReasoning)
      router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1&retryWorkout=1`)
      return
    }

    const merged = mergePlanForms(
      {
        ...dietResult.formData,
        title: 'Weekly Diet + Workout Update (Draft)',
      },
      {
        workout_plan: workoutResult.formData.workout_plan,
        cardio_plan: workoutResult.formData.cardio_plan,
        coach_notes: [dietResult.formData.coach_notes, workoutResult.formData.coach_notes]
          .filter(Boolean)
          .join('\n\n'),
      }
    )

    const finalReasoning = workoutResult.aiReasoning ?? dietResult.aiReasoning
    if (finalReasoning) {
      setReasoning(finalReasoning)
      saveAiReasoningToSession(clientId, finalReasoning)
    }

    savePlanDraftToSession(clientId, merged)
    router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1`)
  }

  return (
    <div>
      <p style={s.sectionLabel}>Weekly coaching</p>
      <ActionCard
        title="Generate weekly diet + workout"
        description="Runs diet first, then uses that updated diet as context for the workout update"
        primary
        disabled={busy !== null}
        onClick={() => void runWeeklyUpdate()}
      />
      <ActionCard
        title={dietAction.label}
        description={`${dietAction.description} only`}
        disabled={busy !== null}
        onClick={() => void runAction(dietAction)}
      />
      <ActionCard
        title={workoutAction.label}
        description="Use only when the diet update is already saved in the active plan"
        disabled={busy !== null}
        onClick={() => void runAction(workoutAction)}
      />
      <OptionalCoachNote value={coachNote} onChange={setCoachNote} />
      <GenerationStatus message={status} />
      {error && <div style={s.error}>{error}</div>}
      <AiReasoningPanel reasoning={reasoning} />
    </div>
  )
}
