import { calculateAiCostUsd } from '@/lib/admin/pricing'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiGenerationLog } from '@/types/database'

export const AI_PROMPT_VERSION = process.env.AI_PROMPT_VERSION?.trim() || 'v1'

export function isDebugAiEnabled(): boolean {
  const value = process.env.DEBUG_AI?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes'
}

export type AiGenerationLogInput = {
  clientId: string | null
  coachId: string | null
  action: string
  model: string | null
  promptVersion?: string | null
  latencyMs: number
  promptTokens: number | null
  completionTokens: number | null
  retryCount: number
  validationResult: string
  success: boolean
  knowledgeRefs: string[] | null
  rawOutput?: unknown
  renderedOutput?: unknown
}

/** Persist one AI generation attempt. Never throws — logging must not break generation. */
export async function logAiGeneration(input: AiGenerationLogInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const debug = isDebugAiEnabled()

    const costs = calculateAiCostUsd(input.model, input.promptTokens, input.completionTokens)

    const row = {
      client_id: input.clientId,
      coach_id: input.coachId,
      action: input.action,
      model: input.model,
      prompt_version: input.promptVersion?.trim() || AI_PROMPT_VERSION,
      latency_ms: input.latencyMs,
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      retry_count: input.retryCount,
      validation_result: input.validationResult,
      success: input.success,
      knowledge_refs: input.knowledgeRefs,
      input_cost_usd: costs.inputCostUsd,
      output_cost_usd: costs.outputCostUsd,
      total_cost_usd: costs.totalCostUsd,
      raw_output: debug && input.rawOutput != null ? input.rawOutput : null,
      rendered_output: debug && input.renderedOutput != null ? input.renderedOutput : null,
      created_at: new Date().toISOString(),
    }

    const { error } = await admin.from('ai_generation_logs').insert(row)
    if (error) {
      console.error('[ai-trace] failed to write log:', error.message)
    }
  } catch (err) {
    console.error('[ai-trace] logging error:', err)
  }
}

export type AiMetricsSummary = {
  totalAttempts: number
  successCount: number
  failureCount: number
  averageLatencyMs: number | null
  aiSuccessRate: number | null
  retryRate: number | null
  validationFailureRate: number | null
  lastSuccessfulGeneration: string | null
}

export async function computeAiMetricsFromLogs(): Promise<AiMetricsSummary> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_generation_logs')
    .select('success, latency_ms, retry_count, validation_result, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error || !data || data.length === 0) {
    return {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      averageLatencyMs: null,
      aiSuccessRate: null,
      retryRate: null,
      validationFailureRate: null,
      lastSuccessfulGeneration: null,
    }
  }

  const logs = data as Pick<
    AiGenerationLog,
    'success' | 'latency_ms' | 'retry_count' | 'validation_result' | 'created_at'
  >[]

  const totalAttempts = logs.length
  const successCount = logs.filter((l) => l.success).length
  const failureCount = totalAttempts - successCount
  const latencies = logs.map((l) => l.latency_ms).filter((v): v is number => typeof v === 'number')
  const averageLatencyMs =
    latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null

  const aiSuccessRate = totalAttempts > 0 ? Math.round((successCount / totalAttempts) * 1000) / 10 : null
  const retryRate =
    totalAttempts > 0
      ? Math.round((logs.filter((l) => (l.retry_count ?? 0) > 0).length / totalAttempts) * 1000) / 10
      : null
  const validationFailureRate =
    totalAttempts > 0
      ? Math.round(
          (logs.filter((l) => !l.success && l.validation_result?.toLowerCase() !== 'pass').length /
            totalAttempts) *
            1000
        ) / 10
      : null

  const lastSuccess = logs.find((l) => l.success)

  return {
    totalAttempts,
    successCount,
    failureCount,
    averageLatencyMs,
    aiSuccessRate,
    retryRate,
    validationFailureRate,
    lastSuccessfulGeneration: lastSuccess?.created_at ?? null,
  }
}
