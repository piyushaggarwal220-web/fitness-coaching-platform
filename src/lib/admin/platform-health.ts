import { DEFAULTS, MODELS } from '@/lib/ai/config'
import { computeAiMetricsFromLogs } from '@/lib/ai/trace-log'
import { getPlanProviderMode } from '@/lib/ai/plan-provider'

export type PlatformHealth = {
  anthropicConfigured: boolean
  anthropicStatus: 'configured' | 'not_configured'
  aiProvider: string
  currentModel: string
  lastSuccessfulGeneration: string | null
  averageLatencyMs: number | null
  aiSuccessRate: number | null
  retryRate: number | null
  validationFailureRate: number | null
  metricsAvailable: boolean
  metricsNote: string
  totalAttempts: number
}

/** Read-only platform health from env/config plus AI trace metrics when available. */
export async function getPlatformHealth(): Promise<PlatformHealth> {
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim())
  const providerMode = getPlanProviderMode()
  const metrics = await computeAiMetricsFromLogs()
  const providerLabel =
    providerMode === 'mock' ? 'mock' : providerMode === 'claude' ? 'anthropic' : 'openai'

  return {
    anthropicConfigured: openaiConfigured,
    anthropicStatus: openaiConfigured ? 'configured' : 'not_configured',
    aiProvider: providerLabel,
    currentModel: DEFAULTS.DEFAULT_MODEL || MODELS.GPT_TERRA,
    lastSuccessfulGeneration: metrics.lastSuccessfulGeneration,
    averageLatencyMs: metrics.averageLatencyMs,
    aiSuccessRate: metrics.aiSuccessRate,
    retryRate: metrics.retryRate,
    validationFailureRate: metrics.validationFailureRate,
    metricsAvailable: metrics.totalAttempts > 0,
    metricsNote:
      metrics.totalAttempts > 0
        ? `Based on ${metrics.totalAttempts} logged generation attempt${metrics.totalAttempts === 1 ? '' : 's'}.`
        : 'No AI generation logs yet. Metrics appear after the first logged attempt.',
    totalAttempts: metrics.totalAttempts,
  }
}

export type SystemSettings = {
  environment: string
  aiProvider: string
  currentModel: string
  featureFlags: Record<string, boolean>
}

export function getSystemSettings(): SystemSettings {
  const providerMode = getPlanProviderMode()

  return {
    environment: process.env.NODE_ENV ?? 'development',
    aiProvider:
      providerMode === 'mock' ? 'mock' : providerMode === 'claude' ? 'anthropic (claude)' : 'openai',
    currentModel: DEFAULTS.DEFAULT_MODEL || MODELS.GPT_TERRA,
    featureFlags: {
      devToolkit: process.env.NODE_ENV === 'development',
      aiPlanProviderMock: providerMode === 'mock',
      paymentsEnabled: Boolean(process.env.RAZORPAY_KEY_ID?.trim()),
    },
  }
}
