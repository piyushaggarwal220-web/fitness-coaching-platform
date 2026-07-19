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

export async function persistDraftGenerationLog(input: {
  clientId: string
  coachId?: string | null
  checkinId?: string | null
  success: boolean
  latencyMs: number
  error?: string | null
  trigger: 'auto' | 'manual' | 'retry'
  planVersion?: string | null
}): Promise<void> {
  const action =
    input.trigger === 'retry'
      ? 'weekly_draft_retry'
      : input.trigger === 'auto'
        ? 'weekly_draft_auto'
        : 'weekly_draft_manual'

  await logAiGeneration({
    clientId: input.clientId,
    coachId: input.coachId ?? null,
    action,
    model: null,
    promptVersion: input.planVersion ?? 'weekly_draft',
    latencyMs: input.latencyMs,
    promptTokens: null,
    completionTokens: null,
    retryCount: input.trigger === 'retry' ? 1 : 0,
    validationResult: input.success ? 'pass' : 'fail',
    success: input.success,
    knowledgeRefs: null,
    renderedOutput: input.checkinId
      ? { checkinId: input.checkinId, error: input.error ?? null }
      : undefined,
  })
}

export async function getLatestDraftLogForCheckin(
  clientId: string,
  checkinId: string
): Promise<{ success: boolean; createdAt: string; action: string; error: string | null } | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('ai_generation_logs')
      .select('success, created_at, action, rendered_output')
      .eq('client_id', clientId)
      .in('action', ['weekly_draft_auto', 'weekly_draft_retry', 'weekly_draft_manual'])
      .order('created_at', { ascending: false })
      .limit(50)

    const row = (data ?? []).find((entry) => {
      const output = entry.rendered_output as
        | { checkinId?: string; output?: { checkinId?: string }; error?: string | null }
        | null
      return output?.checkinId === checkinId || output?.output?.checkinId === checkinId
    })

    if (!row) return null
    const output = row.rendered_output as
      | { error?: string | null; output?: { error?: string | null } }
      | null
    return {
      success: row.success,
      createdAt: row.created_at as string,
      action: row.action as string,
      error: output?.error ?? output?.output?.error ?? null,
    }
  } catch {
    return null
  }
}
