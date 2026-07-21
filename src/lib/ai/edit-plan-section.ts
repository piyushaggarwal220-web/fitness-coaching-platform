import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { MODELS, LIMITS } from '@/lib/ai/config'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import { normalizeAiPlanProse } from '@/lib/ai/plan-format'
import { logAiGeneration } from '@/lib/ai/trace-log'

export type PlanSectionKind = 'nutrition' | 'workout'

export type EditPlanSectionInput = {
  section: PlanSectionKind
  currentText: string
  clientRequest: string
  coachNote?: string | null
  clientName?: string | null
  clientId?: string
}

export type EditPlanSectionResult = {
  revisedText: string
  model: string
  inputTokens: number
  outputTokens: number
  summary: string
}

function sectionLabel(section: PlanSectionKind): string {
  return section === 'nutrition' ? 'nutrition / diet plan' : 'workout plan'
}

function buildMockRevision(input: EditPlanSectionInput): string {
  const note = input.coachNote?.trim()
  const header = [
    `Updated ${sectionLabel(input.section)} (mock)`,
    `Client request: ${input.clientRequest.trim()}`,
    note ? `Coach note: ${note}` : null,
    '',
  ]
    .filter(Boolean)
    .join('\n')

  const body = input.currentText.trim() || `(No prior ${sectionLabel(input.section)} — add structure here.)`
  return `${header}\n${body}\n\n[Apply coach edits: honor the request while keeping day structure and clear exercise/meal lines.]`
}

function extractRevisedText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const fenced = trimmed.match(/```(?:markdown|text|md)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim()) return fenced[1].trim()

  // Prefer JSON { "revisedText": "..." } if the model wraps it
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { revisedText?: unknown; revised_text?: unknown }
      const value = parsed.revisedText ?? parsed.revised_text
      if (typeof value === 'string' && value.trim()) return value.trim()
    } catch {
      /* fall through */
    }
  }

  return trimmed
}

export async function editPlanSection(input: EditPlanSectionInput): Promise<EditPlanSectionResult> {
  const currentText = input.currentText.trim()
  const clientRequest = input.clientRequest.trim()
  if (!clientRequest) {
    throw new Error('Client request is required.')
  }

  const section = sectionLabel(input.section)
  const systemPrompt = [
    'You are an expert fitness coach editor.',
    `Revise the client's ${section} based on the client's request.`,
    'Rules:',
    '- Preserve useful structure: day headers (Monday / Day 1), meal names, exercise lines with sets×reps.',
    '- Make only the changes needed to satisfy the request — do not rewrite unrelated days unless asked.',
    '- Keep language natural, human, and coach-ready in plain text, not JSON.',
    '- Do not use Markdown, asterisks, star bullets, or hyphen bullets.',
    '- Use plain section titles and put list items on separate lines without symbol prefixes.',
    '- Do not invent unsafe extreme restrictions or medical claims.',
    '- Output ONLY the full revised plan text for that section — no preamble, no explanation.',
  ].join('\n')

  const userPrompt = [
    input.clientName ? `Client: ${input.clientName}` : null,
    `Section: ${section}`,
    '',
    '## Client request',
    clientRequest,
    input.coachNote?.trim() ? `\n## Extra coach guidance\n${input.coachNote.trim()}` : null,
    '',
    '## Current plan text',
    currentText || '(empty — create a solid starter section that matches the request)',
  ]
    .filter((line) => line != null)
    .join('\n')

  const providerMode = getPlanProviderMode()
  const started = Date.now()

  try {
    const response = await callPlanProvider(providerMode, {
      systemPrompt,
      userPrompt,
      model: MODELS.CLAUDE_SONNET,
      maxTokens: LIMITS.MAX_PLAN_TOKENS,
      temperature: 0.4,
      mockText: buildMockRevision(input),
    })

    const revisedText = normalizeAiPlanProse(extractRevisedText(response.text))
    if (!revisedText) {
      throw new ClaudeResponseError('AI returned an empty revision.')
    }

    const summary = `Updated ${section} from client request (${revisedText.length} chars).`

    await logAiGeneration({
      clientId: input.clientId ?? null,
      coachId: null,
      action: `edit_plan_${input.section}`,
      model: response.model,
      latencyMs: Date.now() - started,
      promptTokens: response.inputTokens,
      completionTokens: response.outputTokens,
      retryCount: 0,
      validationResult: 'ok',
      success: true,
      knowledgeRefs: null,
      renderedOutput: { summary },
    }).catch(() => undefined)

    return {
      revisedText,
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      summary,
    }
  } catch (err) {
    await logAiGeneration({
      clientId: input.clientId ?? null,
      coachId: null,
      action: `edit_plan_${input.section}`,
      model: MODELS.CLAUDE_SONNET,
      latencyMs: Date.now() - started,
      promptTokens: null,
      completionTokens: null,
      retryCount: 0,
      validationResult: 'error',
      success: false,
      knowledgeRefs: null,
      rawOutput: { error: err instanceof Error ? err.message : 'edit failed' },
    }).catch(() => undefined)
    throw err
  }
}
