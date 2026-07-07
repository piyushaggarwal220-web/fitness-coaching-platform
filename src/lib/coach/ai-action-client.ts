import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import type { AiReasoningDisplay } from '@/lib/coach/ai-actions'
import type { PlanFormData } from '@/types/database'

export type CoachAiActionResponse = {
  success: boolean
  error?: string
  formData?: PlanFormData
  aiReasoning?: AiReasoningDisplay
  insightText?: string
  coachMessage?: string
  selectedModel?: string
  generationTimeMs?: number
}

export async function runCoachAiAction(input: {
  action: CoachAiActionId
  clientId: string
  coachNote?: string | null
  checkinId?: string | null
  draftPlanContext?: PlanFormData | null
}): Promise<CoachAiActionResponse> {
  const response = await fetch('/api/coach/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: input.clientId,
      action: input.action,
      coachNote: input.coachNote?.trim() || null,
      checkinId: input.checkinId ?? null,
      draftPlanContext: input.draftPlanContext ?? null,
    }),
  })

  const data = await response.json()

  if (!response.ok || !data.success) {
    return { success: false, error: data.error ?? 'Action failed.' }
  }

  return {
    success: true,
    formData: data.formData,
    aiReasoning: data.aiReasoning,
    insightText: data.insightText,
    coachMessage: data.coachMessage,
    selectedModel: data.selectedModel,
    generationTimeMs: data.generationTimeMs,
  }
}
