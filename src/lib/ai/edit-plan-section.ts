import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { LIMITS, MODELS, PLAN_GENERATION_TEMPERATURE } from '@/lib/ai/config'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import { normalizeAiPlanProse } from '@/lib/ai/plan-format'
import {
  CLIENT_PLAN_EDIT_WEEK_RULES,
  stripClientWeekHandoffLanguage,
} from '@/lib/ai/plan-prose-guards'
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

function planTextSimilarityLocal(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
  const wa = tokenize(a)
  const wb = tokenize(b)
  if (wa.size === 0 && wb.size === 0) return 1
  if (wa.size === 0 || wb.size === 0) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter += 1
  return inter / Math.max(wa.size, wb.size)
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
    '- Preserve useful structure: day headers should stay as Day N (Weekday) with Day 1 = Monday (e.g. Day 1 (Monday)), meal names, exercise lines with sets x reps (plain letter x).',
    '- Apply the client request with VISIBLE edits — do not return a near-copy or paraphrase of the current plan.',
    '- Make only the changes needed to satisfy the request — do not rewrite unrelated days unless asked.',
    '- If the request names specific foods, exercises, days, or constraints, those must appear differently in the revised text.',
    '- Keep language natural, human, and coach-ready in plain text, not JSON.',
    '- Do not use Markdown, asterisks, star bullets, or hyphen bullets.',
    '- Use plain section titles and put list items on separate lines without symbol prefixes.',
    '- For workout sections: one exercise per line under each day header as "Exercise: N sets x M reps" (or timed duration). The daily tracker parses these lines.',
    '- For nutrition sections: keep protein as high as is realistically comfortable for the client. Do not force aggressive protein targets if they struggle with high protein; coach getting as much as comfortably possible instead.',
    '- Do not invent unsafe extreme restrictions or medical claims.',
    '- Never introduce cross-day references ("same as Day 1", "repeat Day 2", "follow Day 3\'s plan", "as above"). Every day must keep its full meal or exercise list written out so the daily tracker can parse it.',
    '- Never put the next day\'s exercises under Post-Workout / Recovery / Stretching of the previous day.',
    '- If the request asks one day to mirror another, copy the full content under both day headers instead of pointing between days.',
    `- ${CLIENT_PLAN_EDIT_WEEK_RULES}`,
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
  // Full-week section rewrites need the same model/token headroom as generation —
  // Haiku + 2k ceilings truncated mid-week ("half plans").
  const model = MODELS.CLAUDE_SONNET
  const maxAttempts = providerMode === 'mock' ? 1 : 2
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let lastRaw = ''

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const retryHint =
        attempt > 0
          ? '\n\n## Retry instruction\nPrevious output was too similar to the current plan or truncated. Rewrite the COMPLETE section with clear, visible changes that satisfy the client request. No cross-day references and no preamble.'
          : ''

      let response
      try {
        response = await callPlanProvider(providerMode, {
          systemPrompt,
          userPrompt: `${userPrompt}${retryHint}`,
          model,
          maxTokens: LIMITS.MAX_SECTION_EDIT_TOKENS,
          temperature: PLAN_GENERATION_TEMPERATURE,
          mockText: buildMockRevision(input),
        })
      } catch (err) {
        if (
          err instanceof ClaudeResponseError &&
          err.retryable &&
          attempt < maxAttempts - 1
        ) {
          continue
        }
        throw err
      }

      totalInputTokens += response.inputTokens
      totalOutputTokens += response.outputTokens
      lastRaw = response.text

      if (response.stopReason === 'max_tokens') {
        if (attempt < maxAttempts - 1) continue
        throw new ClaudeResponseError(
          'AI revision was truncated (hit max output tokens). Try again or shorten coach notes.'
        )
      }

      const revisedText = stripClientWeekHandoffLanguage(
        normalizeAiPlanProse(extractRevisedText(response.text))
      )
      if (!revisedText) {
        if (attempt < maxAttempts - 1) continue
        throw new ClaudeResponseError('AI returned an empty revision.')
      }

      // Reject near-copies so client requests actually land (retry once with stronger hint).
      if (currentText && attempt === 0) {
        const similarity = planTextSimilarityLocal(currentText, revisedText)
        if (similarity >= 0.93) {
          continue
        }
      }

      const summary = `Updated ${section} from client request (${revisedText.length} chars).`

      await logAiGeneration({
        clientId: input.clientId ?? null,
        coachId: null,
        action: `edit_plan_${input.section}`,
        model: response.model,
        latencyMs: Date.now() - started,
        promptTokens: totalInputTokens,
        completionTokens: totalOutputTokens,
        retryCount: attempt,
        validationResult: 'ok',
        success: true,
        knowledgeRefs: null,
        renderedOutput: { summary },
      }).catch(() => undefined)

      return {
        revisedText,
        model: response.model,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        summary,
      }
    }

    throw new ClaudeResponseError(
      `AI revision failed after retry. Raw response: ${lastRaw.slice(0, 400)}`
    )
  } catch (err) {
    await logAiGeneration({
      clientId: input.clientId ?? null,
      coachId: null,
      action: `edit_plan_${input.section}`,
      model,
      latencyMs: Date.now() - started,
      promptTokens: totalInputTokens || null,
      completionTokens: totalOutputTokens || null,
      retryCount: 0,
      validationResult: 'error',
      success: false,
      knowledgeRefs: null,
      rawOutput: { error: err instanceof Error ? err.message : 'edit failed' },
    }).catch(() => undefined)
    throw err
  }
}
