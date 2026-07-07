import { DEFAULTS, MODELS } from '@/lib/ai/config'
import { getPlanProviderMode } from '@/lib/ai/plan-provider'

export type PlatformHealth = {
  anthropicConfigured: boolean
  anthropicStatus: 'configured' | 'not_configured'
  aiProvider: string
  currentModel: string
  lastSuccessfulGeneration: string | null
  averageLatencyMs: number | null
  aiSuccessRate: number | null
  jsonValidationSuccessRate: number | null
  metricsAvailable: boolean
  metricsNote: string
}

/** Read-only platform health from env/config. AI trace metrics require Phase 3 logging. */
export function getPlatformHealth(): PlatformHealth {
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const providerMode = getPlanProviderMode()

  return {
    anthropicConfigured,
    anthropicStatus: anthropicConfigured ? 'configured' : 'not_configured',
    aiProvider: providerMode === 'mock' ? 'mock' : 'anthropic',
    currentModel: DEFAULTS.DEFAULT_MODEL || MODELS.CLAUDE_SONNET,
    lastSuccessfulGeneration: null,
    averageLatencyMs: null,
    aiSuccessRate: null,
    jsonValidationSuccessRate: null,
    metricsAvailable: false,
    metricsNote: 'AI generation metrics will be available after AI Trace Mode is enabled.',
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
