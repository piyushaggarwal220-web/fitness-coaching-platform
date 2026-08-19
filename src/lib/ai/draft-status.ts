import {
  getLatestDraftLogForCheckin,
  type DraftCheckinLog,
} from '@/lib/ai/draft-workflow-log'
import type { Checkin, Plan } from '@/types/database'

/** How long a "started" log keeps the UI in generating state. */
export const DRAFT_GENERATING_WINDOW_MS = 15 * 60 * 1000
/** Fallback when no start log exists (pre-deploy auto jobs). */
export const DRAFT_SUBMIT_HEURISTIC_MS = 12 * 60 * 1000

export function resolveDraftPollingState(input: {
  hasDraft: boolean
  log: Pick<DraftCheckinLog, 'phase' | 'error' | 'createdAt'> | null
  submittedAtMs: number
  nowMs?: number
  /** False when this weekly check-in is a cadence skip (3 month, odd week). */
  expectAutoDraft?: boolean
}): {
  isGenerating: boolean
  generationFailed: boolean
  failureRaw: string | null
} {
  if (input.hasDraft) {
    return { isGenerating: false, generationFailed: false, failureRaw: null }
  }

  const now = input.nowMs ?? Date.now()
  const submitAgeMs =
    input.submittedAtMs > 0 ? now - input.submittedAtMs : Number.POSITIVE_INFINITY
  const logAgeMs = input.log?.createdAt
    ? now - new Date(input.log.createdAt).getTime()
    : Number.POSITIVE_INFINITY

  const startedInFlight = Boolean(
    input.log && input.log.phase === 'started' && logAgeMs < DRAFT_GENERATING_WINDOW_MS
  )
  const startedTimedOut = Boolean(
    input.log && input.log.phase === 'started' && logAgeMs >= DRAFT_GENERATING_WINDOW_MS
  )
  const finishFailed = Boolean(input.log && input.log.phase === 'failed')
  const expectAutoDraft = input.expectAutoDraft !== false
  const recentSubmitNoLog =
    expectAutoDraft &&
    !input.log &&
    input.submittedAtMs > 0 &&
    submitAgeMs < DRAFT_SUBMIT_HEURISTIC_MS
  const submitTimedOutNoLog =
    expectAutoDraft &&
    !input.log &&
    input.submittedAtMs > 0 &&
    submitAgeMs >= DRAFT_SUBMIT_HEURISTIC_MS

  const generationFailed = finishFailed || startedTimedOut || submitTimedOutNoLog
  const isGenerating = !generationFailed && (startedInFlight || recentSubmitNoLog)

  let failureRaw: string | null = null
  if (generationFailed) {
    if (finishFailed) failureRaw = input.log?.error ?? null
    else if (startedTimedOut || submitTimedOutNoLog) {
      failureRaw = 'Draft generation timed out. Use Retry to generate again.'
    }
  }

  return { isGenerating, generationFailed, failureRaw }
}

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
