import { z } from 'zod'

export const jarvisPlanSchema = z.object({
  thinking_summary: z.string().max(500),
  reply_without_tools: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        tool: z.string().min(1),
        input: z.record(z.string(), z.unknown()).default({}),
        why: z.string().min(1),
      })
    )
    .max(8)
    .default([]),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().optional(),
})

export type JarvisPlan = z.infer<typeof jarvisPlanSchema>

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function asInputRecord(value: unknown): Record<string, unknown> {
  const obj = asObject(value)
  if (obj) return obj
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      const parsedObj = asObject(parsed)
      if (parsedObj) return parsedObj
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * GPT-5.6 Luna emits OpenAI-style tool call objects:
 * `{ tool, arguments }` or `{ name, arguments }` or `{ function: { name, arguments } }`
 * and often omits `why`/`input`. Map those onto the canonical Jarvis plan
 * before Zod validation. Does not skip validation.
 */
export function normalizeJarvisPlanOutput(raw: unknown): unknown {
  const obj = asObject(raw)
  if (!obj) return raw
  if (!Array.isArray(obj.tool_calls)) return obj

  const thinking =
    typeof obj.thinking_summary === 'string' && obj.thinking_summary.trim()
      ? obj.thinking_summary.trim().slice(0, 200)
      : 'Requested to answer the operator.'

  return {
    ...obj,
    tool_calls: obj.tool_calls.map((call) => {
      const item = asObject(call) ?? {}
      const fn = asObject(item.function)
      const tool =
        (typeof item.tool === 'string' && item.tool) ||
        (typeof item.name === 'string' && item.name) ||
        (typeof fn?.name === 'string' && fn.name) ||
        ''
      const whyRaw = item.why ?? item.reason ?? item.rationale ?? item.description
      const why = typeof whyRaw === 'string' && whyRaw.trim() ? whyRaw.trim() : thinking
      return {
        tool,
        input: asInputRecord(item.input ?? item.arguments ?? fn?.arguments),
        why,
      }
    }),
  }
}

export const JARVIS_PLAN_JSON_CONTRACT = `Return JSON with this exact shape:
{
  "thinking_summary": "short evidence-oriented summary",
  "tool_calls": [
    { "tool": "registered.tool_name", "input": {}, "why": "why this read/action is needed" }
  ],
  "needs_clarification": false,
  "clarification_question": "",
  "reply_without_tools": ""
}
Rules:
- "tool" is the registered tool name string (not "name" or nested function.name).
- "input" is a JSON object of tool arguments (not "arguments", not a string).
- "why" is required for every tool call.
- Use tool_calls=[] when no tool is needed.`
