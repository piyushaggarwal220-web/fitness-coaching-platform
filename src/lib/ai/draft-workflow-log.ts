import { getLastCompileReport } from '@/lib/ai/prompt-cache'
import { logAiGeneration } from '@/lib/ai/trace-log'
import { createAdminClient } from '@/lib/supabase/admin'

export type DraftWorkflowEvent =
  | 'draft_started'
  | 'draft_finished'
  | 'draft_failed'
  | 'retry_started'
  | 'retry_finished'
  | 'publish_completed'

export type DraftWorkflowLogInput = {
  event: DraftWorkflowEvent
  clientId: string
  coachId?: string | null
  checkinId?: string | null
  checkinWeek?: number | null
  planId?: string | null
  planVersion?: number | null
  generationTimeMs?: number | null
  error?: string | null
  trigger?: 'auto' | 'manual' | 'retry'
}

function cacheMetrics(): { hitRatio: number | null; hits: number; misses: number } {
  const report = getLastCompileReport()
  if (!report) return { hitRatio: null, hits: 0, misses: 0 }
  return {
    hitRatio: report.hitRatio,
    hits: report.cacheHits,
    misses: report.cacheMisses,
  }
}

/** Structured server logging — never exposed to clients. */
export function logDraftWorkflow(input: DraftWorkflowLogInput): void {
  const cache = cacheMetrics()
  const payload = {
    event: input.event,
    clientId: input.clientId,
    coachId: input.coachId ?? null,
    checkinId: input.checkinId ?? null,
    checkinWeek: input.checkinWeek ?? null,
    planId: input.planId ?? null,
    planVersion: input.planVersion ?? null,
    generationTimeMs: input.generationTimeMs ?? null,
    trigger: input.trigger ?? 'auto',
    cacheHitRatio: cache.hitRatio,
    cacheHits: cache.hits,
    cacheMisses: cache.misses,
    error: input.error ?? null,
    at: new Date().toISOString(),
  }

  if (input.event.includes('failed')) {
    console.error('[draft-workflow]', JSON.stringify(payload))
  } else {
    console.info('[draft-workflow]', JSON.stringify(payload))
  }
}

export type DraftSectionUsage = {
  action: string
  model: string
  inputTokens: number
  outputTokens: number
}

const DRAFT_FINISH_ACTIONS = [
  'weekly_draft_auto',
  'weekly_draft_retry',
  'weekly_draft_manual',
] as const

const DRAFT_STARTED_ACTION = 'weekly_draft_started'

export type DraftLogPhase = 'started' | 'finished' | 'failed'

export type DraftCheckinLog = {
  success: boolean
  createdAt: string
  action: string
  error: string | null
  phase: DraftLogPhase
}

function draftActionForTrigger(trigger: 'auto' | 'manual' | 'retry'): string {
  if (trigger === 'retry') return 'weekly_draft_retry'
  if (trigger === 'auto') return 'weekly_draft_auto'
  return 'weekly_draft_manual'
}

function readCheckinIdFromOutput(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null
  const row = output as {
    checkinId?: string
    output?: { checkinId?: string }
  }
  return row.checkinId ?? row.output?.checkinId ?? null
}

function readErrorFromOutput(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null
  const row = output as {
    error?: string | null
    output?: { error?: string | null }
  }
  return row.error ?? row.output?.error ?? null
}

/** Record that generation is in flight so the coach panel can poll accurately. */
export async function persistDraftGenerationStarted(input: {
  clientId: string
  coachId?: string | null
  checkinId?: string | null
  trigger: 'auto' | 'manual' | 'retry'
}): Promise<void> {
  await logAiGeneration({
    clientId: input.clientId,
    coachId: input.coachId ?? null,
    action: DRAFT_STARTED_ACTION,
    model: null,
    promptVersion: 'weekly_draft',
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    retryCount: input.trigger === 'retry' ? 1 : 0,
    validationResult: 'started',
    success: true,
    knowledgeRefs: null,
    renderedOutput: {
      checkinId: input.checkinId ?? null,
      phase: 'started',
      trigger: input.trigger,
    },
  })
}

export async function persistDraftGenerationLog(input: {
  clientId: string
  coachId?: string | null
  checkinId?: string | null
  success: boolean
  latencyMs: number
  error?: string | null
  trigger: 'auto' | 'manual' | 'retry'
  planVersion?: string | null
  model?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  skippedCore?: boolean
  skippedSupport?: boolean
  sections?: DraftSectionUsage[]
}): Promise<void> {
  const action = draftActionForTrigger(input.trigger)

  await logAiGeneration({
    clientId: input.clientId,
    coachId: input.coachId ?? null,
    action,
    model: input.model ?? null,
    promptVersion: input.planVersion ?? 'weekly_draft',
    latencyMs: input.latencyMs,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    retryCount: input.trigger === 'retry' ? 1 : 0,
    validationResult: input.success ? 'pass' : 'fail',
    success: input.success,
    knowledgeRefs: null,
    renderedOutput: {
      checkinId: input.checkinId ?? null,
      error: input.error ?? null,
      skippedCore: input.skippedCore ?? false,
      skippedSupport: input.skippedSupport ?? false,
      sections: input.sections ?? [],
    },
  })
}

export async function getLatestDraftLogForCheckin(
  clientId: string,
  checkinId: string
): Promise<DraftCheckinLog | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('ai_generation_logs')
      .select('success, created_at, action, rendered_output, validation_result')
      .eq('client_id', clientId)
      .in('action', [...DRAFT_FINISH_ACTIONS, DRAFT_STARTED_ACTION])
      .order('created_at', { ascending: false })
      .limit(50)

    const row = (data ?? []).find((entry) => readCheckinIdFromOutput(entry.rendered_output) === checkinId)

    if (!row) return null

    const isStarted =
      row.action === DRAFT_STARTED_ACTION ||
      (row.rendered_output as { phase?: string } | null)?.phase === 'started' ||
      row.validation_result === 'started'

    let phase: DraftLogPhase = 'finished'
    if (isStarted) phase = 'started'
    else if (!row.success) phase = 'failed'

    return {
      success: Boolean(row.success),
      createdAt: row.created_at as string,
      action: row.action as string,
      error: readErrorFromOutput(row.rendered_output),
      phase,
    }
  } catch {
    return null
  }
}
