import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { generateOpenAIResponse } from '@/lib/ai/openai'

export type PlanProviderMode = 'mock' | 'openai' | 'claude'

export type PlanProviderCallParams = {
  systemPrompt: string
  userPrompt: string
  model: string
  maxTokens: number
  temperature: number
  mockText?: string
  images?: {
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }[]
}

export type PlanProviderCallResult = {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
  retryCount: number
  fallbackUsed: boolean
  stopReason: string | null
}

/**
 * Live generation is OpenAI-only. Mock remains for tests.
 * AI_PLAN_PROVIDER=claude is ignored so production/scripts cannot roll back.
 */
export function getPlanProviderMode(): PlanProviderMode {
  const explicit = process.env.AI_PLAN_PROVIDER?.trim().toLowerCase()
  if (explicit === 'mock') return 'mock'
  return 'openai'
}

function assertOpenAIConfigured(): void {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new ClaudeResponseError(
      'OPENAI_API_KEY is not configured. Add it to the server environment to generate plans.',
      { category: 'configuration' }
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
      retryCount: 0,
      fallbackUsed: false,
      stopReason: 'end_turn',
    }
  }

  assertOpenAIConfigured()
  const response = await generateOpenAIResponse({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    model: params.model,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    images: params.images,
  })

  return {
    text: response.text,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    retryCount: response.retryCount,
    fallbackUsed: response.fallbackUsed,
    stopReason: response.stopReason,
  }
}
