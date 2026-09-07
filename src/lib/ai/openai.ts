import OpenAI, { APIError } from 'openai'
import type {
  Response as OpenAIResponse,
  ResponseInputContent,
} from 'openai/resources/responses/responses'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { DEFAULTS, MODELS } from '@/lib/ai/config'

export type GenerateOpenAIResponseParams = {
  systemPrompt: string
  userPrompt: string
  model?: string
  maxTokens?: number
  temperature?: number
  images?: {
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }[]
}

export type GenerateOpenAIResponseResult = {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
  retryCount: number
  fallbackUsed: boolean
  stopReason: string | null
}

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new ClaudeResponseError('OPENAI_API_KEY is not configured', {
      category: 'configuration',
    })
  }
  return apiKey
}

function toProviderError(err: unknown): ClaudeResponseError {
  if (err instanceof ClaudeResponseError) return err

  if (err instanceof APIError) {
    const status = err.status
    const type = err.code ?? err.type ?? null
    const message = err.message || 'OpenAI API request failed'
    const isQuota =
      status === 429 ||
      type === 'rate_limit_exceeded' ||
      /insufficient_quota|quota/i.test(message)
    const isTimeout = /timeout|timed out/i.test(message)
    const isTransient =
      isQuota ||
      isTimeout ||
      status === 408 ||
      status === 409 ||
      status === 529 ||
      (typeof status === 'number' && status >= 500)
    return new ClaudeResponseError(message, {
      status,
      type: typeof type === 'string' ? type : null,
      cause: err,
      category: isQuota ? 'quota' : isTransient ? 'transient' : 'request',
      retryable: isTransient,
    })
  }

  if (err instanceof Error) {
    const transient =
      /timeout|timed out|ECONNRESET|ECONNREFUSED|fetch failed|network|overloaded|rate limit/i.test(
        err.message
      )
    return new ClaudeResponseError(err.message, {
      cause: err,
      category: transient ? 'transient' : 'unknown',
      retryable: transient,
    })
  }

  return new ClaudeResponseError('An unexpected error occurred while calling OpenAI', { cause: err })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function reasoningEffort(model: string): 'medium' | 'high' {
  return model.includes('astra') ? 'high' : 'medium'
}

/** Astra is opt-in. Auto weekly/high-complexity traffic stays on Luna. */
function resolveLiveModel(model: string): string {
  if (model.includes('astra') && process.env.OPENAI_ALLOW_ASTRA?.trim() !== '1') {
    console.warn('[openai-provider] blocked gpt-6-astra; using gpt-5.6-luna')
    return MODELS.GPT_LUNA
  }
  return model
}

function extractText(response: OpenAIResponse): string {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text
  }

  const chunks: string[] = []
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) chunks.push(part.text)
    }
  }
  return chunks.join('')
}

function mapStopReason(response: OpenAIResponse): string | null {
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason
    if (reason === 'max_output_tokens') return 'max_tokens'
    return reason ?? 'incomplete'
  }
  if (response.status === 'completed') return 'end_turn'
  return response.status ?? null
}

export async function generateOpenAIResponse(
  params: GenerateOpenAIResponseParams
): Promise<GenerateOpenAIResponseResult> {
  let apiKey: string
  try {
    apiKey = getApiKey()
  } catch (error) {
    console.error('[openai-provider]', { category: 'configuration', configured: false })
    throw error
  }

  const client = new OpenAI({
    apiKey,
    timeout: 600_000,
    maxRetries: 0,
  })
  const primaryModel = resolveLiveModel(params.model ?? DEFAULTS.DEFAULT_MODEL)
  const configuredFallback = process.env.OPENAI_FALLBACK_MODEL?.trim()
  const fallbackModel = resolveLiveModel(configuredFallback || DEFAULTS.FALLBACK_MODEL)
  const models = fallbackModel !== primaryModel ? [primaryModel, fallbackModel] : [primaryModel]
  let retryCount = 0
  let lastError: ClaudeResponseError | null = null

  const userContent: ResponseInputContent[] = []
  if (params.images?.length) {
    for (const image of params.images) {
      userContent.push({
        type: 'input_image',
        detail: 'auto',
        image_url: `data:${image.mediaType};base64,${image.data}`,
      })
    }
  }
  userContent.push({ type: 'input_text', text: params.userPrompt })

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]
    const configuredAttempts = Number.parseInt(process.env.OPENAI_MAX_ATTEMPTS || '2', 10)
    const attempts = Number.isFinite(configuredAttempts)
      ? Math.max(1, Math.min(3, configuredAttempts))
      : 2

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await client.responses.create({
          model,
          max_output_tokens: params.maxTokens ?? DEFAULTS.DEFAULT_MAX_TOKENS,
          reasoning: { effort: reasoningEffort(model) },
          input: [
            { role: 'developer', content: params.systemPrompt },
            { role: 'user', content: userContent },
          ],
        })

        const usage = response.usage
        return {
          text: extractText(response),
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          model: response.model,
          retryCount,
          fallbackUsed: modelIndex > 0,
          stopReason: mapStopReason(response),
        }
      } catch (err) {
        const converted = toProviderError(err)
        lastError = converted
        console.warn('[openai-provider]', {
          category: converted.category,
          status: converted.status ?? null,
          attempt,
          model,
          fallback: modelIndex > 0,
        })
        if (!converted.retryable || attempt >= attempts) break
        retryCount += 1
        await sleep(Math.min(4_000, 300 * 2 ** (attempt - 1)))
      }
    }

    if (lastError?.category !== 'quota' && lastError?.category !== 'transient') break
  }

  throw lastError ?? new ClaudeResponseError('OpenAI request failed', { category: 'unknown' })
}
