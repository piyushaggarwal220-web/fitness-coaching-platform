import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { DEFAULTS } from '@/lib/ai/config'

export type GenerateClaudeResponseParams = {
  systemPrompt: string
  userPrompt: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export type GenerateClaudeResponseResult = {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
}

export class ClaudeResponseError extends Error {
  readonly status?: number
  readonly type?: string | null

  constructor(message: string, options?: { status?: number; type?: string | null; cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'ClaudeResponseError'
    this.status = options?.status
    this.type = options?.type
  }
}

function getApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new ClaudeResponseError('ANTHROPIC_API_KEY is not configured')
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
    return new ClaudeResponseError(err.message || 'Anthropic API request failed', {
      status: err.status,
      type: err.type,
      cause: err,
    })
  }

  if (err instanceof Error) {
    return new ClaudeResponseError(err.message, { cause: err })
  }

  return new ClaudeResponseError('An unexpected error occurred while calling Claude', { cause: err })
}

export async function generateClaudeResponse(
  params: GenerateClaudeResponseParams
): Promise<GenerateClaudeResponseResult> {
  const client = new Anthropic({ apiKey: getApiKey() })

  try {
    const response = await client.messages.create({
      model: params.model ?? DEFAULTS.DEFAULT_MODEL,
      max_tokens: params.maxTokens ?? DEFAULTS.DEFAULT_MAX_TOKENS,
      temperature: params.temperature ?? DEFAULTS.DEFAULT_TEMPERATURE,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
    })

    return {
      text: extractText(response.content),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    }
  } catch (err) {
    throw toClaudeResponseError(err)
  }
}
