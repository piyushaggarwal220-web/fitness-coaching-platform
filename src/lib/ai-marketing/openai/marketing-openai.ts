import { z } from 'zod'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { extractJsonCandidates, repairJsonText } from '@/lib/ai/json-extract'
import { MODELS } from '@/lib/ai/config'

export class MarketingAiValidationError extends Error {
  constructor(
    message: string,
    public readonly rawText?: string
  ) {
    super(message)
    this.name = 'MarketingAiValidationError'
  }
}

function parseJsonLoose(text: string): unknown {
  const candidates = extractJsonCandidates(text)
  for (const candidate of candidates) {
    try {
      return JSON.parse(repairJsonText(candidate))
    } catch {
      // try next
    }
  }
  throw new MarketingAiValidationError('Failed to parse AI JSON output', text)
}

export async function generateMarketingJson<T>(params: {
  systemPrompt: string
  userPrompt: string
  schema: z.ZodType<T>
  model?: string
  maxTokens?: number
  normalize?: (parsed: unknown) => unknown
}): Promise<{ data: T; rawText: string; model: string }> {
  const systemPrompt = `${params.systemPrompt}

Return ONLY valid JSON. No markdown fences. No commentary.`

  async function once(userPrompt: string) {
    return generateOpenAIResponse({
      systemPrompt,
      userPrompt,
      model: params.model ?? MODELS.GPT_LUNA,
      maxTokens: params.maxTokens ?? 4000,
    })
  }

  let result = await once(params.userPrompt)
  let parsed: unknown
  try {
    parsed = parseJsonLoose(result.text)
  } catch {
    result = await once(
      `${params.userPrompt}\n\nYour previous reply was not valid JSON. Return one JSON object only.`
    )
    parsed = parseJsonLoose(result.text)
  }

  const candidate = params.normalize ? params.normalize(parsed) : parsed
  const validated = params.schema.safeParse(candidate)
  if (!validated.success) {
    const parsedObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    const calls = Array.isArray(parsedObj?.tool_calls) ? parsedObj.tool_calls : []
    console.warn('[jarvis-json-schema]', {
      issues: validated.error.issues.slice(0, 12).map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
      top_level_keys: parsedObj ? Object.keys(parsedObj) : [],
      tool_call_item_keys: calls.map((call) =>
        call && typeof call === 'object' && !Array.isArray(call)
          ? Object.keys(call as object)
          : [typeof call]
      ),
    })
    const compact = validated.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new MarketingAiValidationError(
      `AI output failed schema validation: ${compact}`,
      result.text
    )
  }

  return { data: validated.data, rawText: result.text, model: result.model }
}
