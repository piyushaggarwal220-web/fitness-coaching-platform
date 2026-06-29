import { ClaudeResponseError, generateClaudeResponse } from '@/lib/ai/anthropic'
import { DEFAULTS } from '@/lib/ai/config'

export type PlanProviderMode = 'mock' | 'claude'

export type PlanProviderCallParams = {
  systemPrompt: string
  userPrompt: string
  model: string
  maxTokens: number
  temperature: number
  mockText?: string
}

export type PlanProviderCallResult = {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
}

/** Mock only when explicitly requested; otherwise Anthropic is always used. */
export function getPlanProviderMode(): PlanProviderMode {
  const explicit = process.env.AI_PLAN_PROVIDER?.trim().toLowerCase()
  if (explicit === 'mock') {
    return 'mock'
  }
  return 'claude'
}

function assertAnthropicConfigured(): void {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new ClaudeResponseError(
      'ANTHROPIC_API_KEY is not configured. Add it to .env.local to generate plans.'
    )
  }
}

export async function callPlanProvider(
  mode: PlanProviderMode,
  params: PlanProviderCallParams
): Promise<PlanProviderCallResult> {
  if (mode === 'mock') {
    if (!params.mockText) {
      throw new Error('Mock provider requires mockText')
    }
    return {
      text: params.mockText,
      model: 'mock-plan-v1',
      inputTokens: 0,
      outputTokens: 0,
    }
  }

  assertAnthropicConfigured()

  const response = await generateClaudeResponse({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    model: params.model,
    maxTokens: params.maxTokens,
    temperature: params.temperature ?? DEFAULTS.DEFAULT_TEMPERATURE,
  })

  return {
    text: response.text,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  }
}
