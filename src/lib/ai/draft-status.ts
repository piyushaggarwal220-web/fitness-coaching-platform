import { getLatestDraftLogForCheckin } from '@/lib/ai/draft-workflow-log'
import type { Checkin, Plan } from '@/types/database'

export type AiGenerationStatus =
  | 'ai_draft_ready'
  | 'generating'
  | 'generation_failed'
  | 'published'
  | 'coach_reviewing'
  | 'no_draft'

export type AiGenerationStatusInfo = {
  status: AiGenerationStatus
  label: string
  description: string
  tone: 'success' | 'warning' | 'danger' | 'muted' | 'accent'
}

const LABELS: Record<AiGenerationStatus, Omit<AiGenerationStatusInfo, 'status'>> = {
  ai_draft_ready: {
    label: 'AI Draft Ready',
    description: 'A draft is ready for your review.',
    tone: 'success',
  },
  generating: {
    label: 'Generating…',
    description: 'AI is building the updated plan.',
    tone: 'accent',
  },
  generation_failed: {
    label: 'Generation Failed',
    description: 'AI draft unavailable. You can retry.',
    tone: 'danger',
  },
  published: {
    label: 'Published',
    description: 'The active plan is live for the client.',
    tone: 'success',
  },
  coach_reviewing: {
    label: 'Coach Reviewing',
    description: 'Check-in submitted — review and respond.',
    tone: 'warning',
  },
  no_draft: {
    label: 'No AI Draft',
    description: 'Generate a draft when ready.',
    tone: 'muted',
  },
}

export function resolveAiGenerationStatus(input: {
  checkin?: Pick<Checkin, 'checkin_type' | 'reviewed' | 'coaching_week'> | null
  draftPlan?: Plan | null
  activePlan?: Plan | null
  isGenerating?: boolean
  generationFailed?: boolean
}): AiGenerationStatusInfo {
  let status: AiGenerationStatus = 'no_draft'

  if (input.isGenerating) {
    status = 'generating'
  } else if (input.generationFailed) {
    status = 'generation_failed'
  } else if (input.draftPlan) {
    status = 'ai_draft_ready'
  } else if (input.checkin && !input.checkin.reviewed && input.checkin.checkin_type === 'weekly') {
    status = 'coach_reviewing'
  } else if (input.activePlan?.active) {
    status = 'published'
  }

  return { status, ...LABELS[status] }
}

export async function resolveWeeklyDraftFailure(
  clientId: string,
  checkinId: string,
  draftPlan: Plan | null
): Promise<boolean> {
  if (draftPlan) return false
  const log = await getLatestDraftLogForCheckin(clientId, checkinId)
  if (!log) return false
  return log.success === false
}

export function isAiDraftPlan(plan: Plan): boolean {
  return plan.title.startsWith('AI Draft') && !plan.active
}
