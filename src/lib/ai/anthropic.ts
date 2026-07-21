import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { DEFAULTS } from '@/lib/ai/config'

export type GenerateClaudeResponseParams = {
  systemPrompt: string
  userPrompt: string
  model?: string
  maxTokens?: number
  temperature?: number
  /** Enable Anthropic automatic prompt caching (default: true) */
  enablePromptCaching?: boolean
  images?: {
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
  }[]
}

export type GenerateClaudeResponseResult = {
  text: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
  model: string
  retryCount: number
  fallbackUsed: boolean
}

export class ClaudeResponseError extends Error {
  readonly status?: number
  readonly type?: string | null
  readonly category: 'configuration' | 'quota' | 'transient' | 'request' | 'unknown'
  readonly retryable: boolean

  constructor(message: string, options?: {
    status?: number
    type?: string | null
    cause?: unknown
    category?: ClaudeResponseError['category']
    retryable?: boolean
  }) {
    super(message, { cause: options?.cause })
    this.name = 'ClaudeResponseError'
    this.status = options?.status
    this.type = options?.type
    this.category = options?.category ?? 'unknown'
    this.retryable = options?.retryable ?? false
  }
}

function getApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new ClaudeResponseError('ANTHROPIC_API_KEY is not configured', {
      category: 'configuration',
    })
  }
  return apiKey
}

function extractText(content: Anthropic.Message['content']): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

function toClaudeResponseError(err: unknown): ClaudeResponseError {
  if (err instanceof ClaudeResponseError) {
    return err
  }

  if (err instanceof APIError) {
    const status = err.status
    const isQuota = status === 429
    const isTransient = status === 408 || status === 409 || (typeof status === 'number' && status >= 500)
    return new ClaudeResponseError(err.message || 'Anthropic API request failed', {
      status,
      type: err.type,
      cause: err,
      category: isQuota ? 'quota' : isTransient ? 'transient' : 'request',
      retryable: isQuota || isTransient,
    })
  }

  if (err instanceof Error) {
    const transient = /timeout|timed out|ECONNRESET|ECONNREFUSED|fetch failed|network/i.test(err.message)
    return new ClaudeResponseError(err.message, {
      cause: err,
      category: transient ? 'transient' : 'unknown',
      retryable: transient,
    })
  }

  return new ClaudeResponseError('An unexpected error occurred while calling Claude', { cause: err })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function generateClaudeResponse(
  params: GenerateClaudeResponseParams
): Promise<GenerateClaudeResponseResult> {
  let apiKey: string
  try {
    apiKey = getApiKey()
  } catch (error) {
    console.error('[anthropic-provider]', { category: 'configuration', configured: false })
    throw error
  }
  const client = new Anthropic({
    apiKey,
    timeout: 180_000,
    maxRetries: 0,
  })
  const useCache = params.enablePromptCaching !== false
  const primaryModel = params.model ?? DEFAULTS.DEFAULT_MODEL
  const configuredFallback = process.env.ANTHROPIC_FALLBACK_MODEL?.trim()
  const fallbackModel = configuredFallback || DEFAULTS.FALLBACK_MODEL
  const models = fallbackModel !== primaryModel ? [primaryModel, fallbackModel] : [primaryModel]
  let retryCount = 0
  let lastError: ClaudeResponseError | null = null

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]
    const configuredAttempts = Number.parseInt(process.env.ANTHROPIC_MAX_ATTEMPTS || '3', 10)
    const attempts = Number.isFinite(configuredAttempts)
      ? Math.max(1, Math.min(4, configuredAttempts))
      : 3
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: params.maxTokens ?? DEFAULTS.DEFAULT_MAX_TOKENS,
          temperature: params.temperature ?? DEFAULTS.DEFAULT_TEMPERATURE,
          system: useCache
            ? [
                {
                  type: 'text' as const,
                  text: params.systemPrompt,
                  cache_control: { type: 'ephemeral' as const },
                },
              ]
            : params.systemPrompt,
          messages: [{
            role: 'user',
            content: params.images?.length
              ? [
                  ...params.images.map((image) => ({
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: image.mediaType,
                      data: image.data,
                    },
                  })),
                  { type: 'text' as const, text: params.userPrompt },
                ]
              : params.userPrompt,
          }],
        })

        const usage = response.usage

        if (process.env.NODE_ENV !== 'production') {
          console.log('Anthropic Cache Usage:', {
            input_tokens: usage.input_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            output_tokens: usage.output_tokens,
          })
        }

        return {
          text: extractText(response.content),
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheCreationInputTokens: usage.cache_creation_input_tokens ?? undefined,
          cacheReadInputTokens: usage.cache_read_input_tokens ?? undefined,
          model: response.model,
          retryCount,
          fallbackUsed: modelIndex > 0,
        }
      } catch (err) {
        const converted = toClaudeResponseError(err)
        lastError = converted
        console.warn('[anthropic-provider]', {
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

  throw lastError ?? new ClaudeResponseError('Anthropic request failed', { category: 'unknown' })
}
