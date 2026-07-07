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
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const providerMode = getPlanProviderMode()
  const metrics = await computeAiMetricsFromLogs()

  return {
    anthropicConfigured,
    anthropicStatus: anthropicConfigured ? 'configured' : 'not_configured',
    aiProvider: providerMode === 'mock' ? 'mock' : 'anthropic',
    currentModel: DEFAULTS.DEFAULT_MODEL || MODELS.CLAUDE_SONNET,
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
    aiProvider: providerMode === 'mock' ? 'mock' : 'anthropic (claude)',
    currentModel: DEFAULTS.DEFAULT_MODEL || MODELS.CLAUDE_SONNET,
    featureFlags: {
      devToolkit: process.env.NODE_ENV === 'development',
      aiPlanProviderMock: providerMode === 'mock',
      paymentsEnabled: Boolean(process.env.RAZORPAY_KEY_ID?.trim()),
    },
  }
}
