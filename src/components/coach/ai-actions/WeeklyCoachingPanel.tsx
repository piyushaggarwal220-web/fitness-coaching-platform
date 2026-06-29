'use client'

import type { AiReasoningDisplay, CoachAiActionDefinition } from '@/lib/coach/ai-actions'
import { WEEKLY_COACHING_ACTIONS } from '@/lib/coach/ai-actions'
import { runCoachAiAction } from '@/lib/coach/ai-action-client'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import {
  saveAiReasoningToSession,
  savePlanDraftToSession,
} from '@/lib/ai/plan-format'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AiReasoningPanel, ActionCard, GenerationStatus, OptionalCoachNote } from './shared'
import { aiActionStyles as s } from './styles'

type WeeklyCoachingPanelProps = {
  clientId: string
  checkinId: string
  onInsight?: (text: string) => void
  onCoachMessage?: (text: string) => void
}

export function WeeklyCoachingPanel({
  clientId,
  checkinId,
  onInsight,
  onCoachMessage,
}: WeeklyCoachingPanelProps) {
  const router = useRouter()
  const [coachNote, setCoachNote] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<CoachAiActionId | null>(null)
  const [reasoning, setReasoning] = useState<AiReasoningDisplay | null>(null)
  const [insight, setInsight] = useState<string | null>(null)

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

    if (action.id === 'review_analyze_checkin' && result.insightText) {
      setInsight(result.insightText)
      onInsight?.(result.insightText)
      return
    }

    if (action.id === 'review_coach_message' && result.coachMessage) {
      onCoachMessage?.(result.coachMessage)
      return
    }

    if (result.formData) {
      savePlanDraftToSession(clientId, result.formData)
      router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1`)
    }
  }

  return (
    <div>
      <p style={s.sectionLabel}>Weekly coaching</p>
      {WEEKLY_COACHING_ACTIONS.map((action) => (
        <ActionCard
          key={action.id}
          title={action.label}
          description={action.description}
          disabled={busy !== null}
          onClick={() => void runAction(action)}
        />
      ))}
      <OptionalCoachNote value={coachNote} onChange={setCoachNote} />
      <GenerationStatus message={status} />
      {error && <div style={s.error}>{error}</div>}
      {insight && (
        <div style={s.card}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>Check-in analysis</h3>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{insight}</p>
        </div>
      )}
      <AiReasoningPanel reasoning={reasoning} />
    </div>
  )
}
