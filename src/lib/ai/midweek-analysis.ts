/**
 * Mid-week check-in AI summary for coaches.
 * Uses Prompt Library category mid_week_analysis when published;
 * otherwise falls back to a concise coach-facing analysis prompt.
 * Costs are logged to ai_generation_logs (admin AI credits / cost tracking).
 */
import { MODELS } from '@/lib/ai/config'
import { generateClaudeResponse } from '@/lib/ai/anthropic'
import { getPublishedPromptByCategory } from '@/lib/ai/prompt-library-loader'
import { logAiGeneration } from '@/lib/ai/trace-log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile } from '@/types/database'

function scoreLine(label: string, value: number | null | undefined): string {
  return `${label}: ${value != null ? `${value}/10` : '—'}`
}

function buildFallbackUserPrompt(
  profile: OnboardingProfile,
  checkin: Checkin,
  previous?: Checkin | null
): string {
  const prevBlock = previous
    ? [
        '',
        '## Previous check-in (for trends)',
        `Type: ${previous.checkin_type}`,
        previous.coaching_week != null ? `Week: ${previous.coaching_week}` : null,
        scoreLine('Diet adherence', previous.diet_adherence ?? previous.adherence_score),
        scoreLine('Workout adherence', previous.workout_adherence ?? previous.training_performance),
        scoreLine('Energy', previous.energy_level),
        scoreLine('Sleep', previous.sleep_quality),
        scoreLine('Stress', previous.stress_level),
        previous.adherence_struggles?.trim()
          ? `Prior slips: ${previous.adherence_struggles.trim()}`
          : null,
        previous.progress_notes?.trim()
          ? `Prior progress notes: ${previous.progress_notes.trim()}`
          : null,
      ]
        .filter((line) => line != null)
        .join('\n')
    : ''

  return [
    `Client: ${profile.name || profile.email || checkin.client_id}`,
    profile.fitness_goal ? `Goal: ${profile.fitness_goal}` : null,
    checkin.coaching_week != null ? `Coaching week: ${checkin.coaching_week}` : null,
    '',
    '## Mid-week scores',
    scoreLine('Diet adherence', checkin.diet_adherence ?? checkin.adherence_score),
    scoreLine('Workout adherence', checkin.workout_adherence ?? checkin.training_performance),
    scoreLine('Energy', checkin.energy_level),
    scoreLine('Sleep', checkin.sleep_quality),
    scoreLine('Stress', checkin.stress_level),
    scoreLine('Hunger', checkin.hunger_level),
    '',
    '## Client written input',
    `Wins: ${checkin.adherence_wins?.trim() || '—'}`,
    `Slips: ${checkin.adherence_struggles?.trim() || '—'}`,
    `Pain/injuries: ${checkin.pain_injuries?.trim() || '—'}`,
    `Questions: ${checkin.questions_for_coach?.trim() || '—'}`,
    `Additional comments: ${checkin.notes?.trim() || '—'}`,
    prevBlock,
    '',
    'Write a coach-ready briefing the coach can read in under 60 seconds before messaging this client.',
    'Use EXACTLY these headings (plain text, no markdown fences, no JSON):',
    '',
    'SNAPSHOT',
    '(2–3 sentences: how the week is going overall)',
    '',
    'FLAGS',
    '(bullet lines starting with - for risks: low adherence, sleep, stress, pain, hunger — or "- None" if clean)',
    '',
    'CLIENT VOICE',
    '(1–2 sentences paraphrasing wins, slips, questions in coach language)',
    '',
    'COACH TALK TRACK',
    '(3–5 short lines the coach can send almost as-is: acknowledge, address slips/questions, one clear next action)',
    '',
    'HOLD OR NUDGE',
    '(one line: "Hold current plan" OR a specific micro-adjustment suggestion for end-of-week review — do not invent a full new plan)',
  ]
    .filter((line) => line != null)
    .join('\n')
}

const FALLBACK_SYSTEM = [
  'You are an expert fitness coach assistant for LURVOX.',
  'Turn mid-week check-ins into a skim-ready briefing so a human coach can reply fast and confidently.',
  'Be concrete, brief, and actionable. Do not invent measurements, photos, or facts that were not provided.',
  'Never invent medical diagnoses. Flag pain for the coach to ask about — do not prescribe treatment.',
  'Output plain text only — no JSON, no markdown fences, no asterisks.',
].join(' ')

const OUTPUT_INSTRUCTIONS = [
  '# Output',
  'Respond with plain text coach briefing only (no JSON, no markdown fences), unless the library template above requires coach_notes JSON — in that case put the analysis in coach_notes and use empty workout/nutrition placeholders.',
].join('\n')

function extractSummaryText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
        coach_notes?: unknown
      }
      if (typeof parsed.coach_notes === 'string' && parsed.coach_notes.trim()) {
        return parsed.coach_notes.trim()
      }
    }
  } catch {
    // plain text path
  }
  return trimmed
}

export async function loadCachedMidWeekSummary(checkinId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ai_generation_logs')
    .select('rendered_output, created_at')
    .eq('action', 'mid_week_analysis')
    .eq('success', true)
    .contains('rendered_output', { checkinId })
    .order('created_at', { ascending: false })
    .limit(5)

  for (const row of data ?? []) {
    const rendered = row.rendered_output as { checkinId?: string; summary?: string } | null
    if (rendered?.checkinId === checkinId && rendered.summary?.trim()) {
      return rendered.summary.trim()
    }
  }
  return null
}

async function loadPreviousCheckin(checkin: Checkin): Promise<Checkin | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('checkins')
    .select('*')
    .eq('client_id', checkin.client_id)
    .lt('submitted_at', checkin.submitted_at)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as Checkin | null) ?? null
}

export async function generateMidWeekAnalysis(input: {
  profile: OnboardingProfile
  checkin: Checkin
  coachId?: string | null
  force?: boolean
}): Promise<{ summary: string; cached: boolean }> {
  if (!input.force) {
    const cached = await loadCachedMidWeekSummary(input.checkin.id)
    if (cached) return { summary: cached, cached: true }
  }

  const previous = await loadPreviousCheckin(input.checkin)
  const libraryPrompt = await getPublishedPromptByCategory('mid_week_analysis')
  const systemPrompt = libraryPrompt?.promptBody?.trim()
    ? `${FALLBACK_SYSTEM}\n\n# Library template\n${libraryPrompt.promptBody}\n\n${OUTPUT_INSTRUCTIONS}`
    : `${FALLBACK_SYSTEM}\n\n${OUTPUT_INSTRUCTIONS}`
  const userPrompt = buildFallbackUserPrompt(input.profile, input.checkin, previous)

  const started = Date.now()
  try {
    const result = await generateClaudeResponse({
      systemPrompt,
      userPrompt,
      model: MODELS.CLAUDE_HAIKU,
      maxTokens: 1100,
      temperature: 0.3,
    })
    const summary = extractSummaryText(result.text)
    if (!summary) throw new Error('Empty mid-week analysis')

    await logAiGeneration({
      clientId: input.checkin.client_id,
      coachId: input.coachId ?? null,
      action: 'mid_week_analysis',
      model: result.model,
      promptVersion: libraryPrompt
        ? `library:${libraryPrompt.slug}:v${libraryPrompt.version}`
        : 'fallback-v2',
      latencyMs: Date.now() - started,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
      retryCount: result.retryCount,
      validationResult: 'ok',
      success: true,
      knowledgeRefs: null,
      renderedOutput: { checkinId: input.checkin.id, summary },
    })

    return { summary, cached: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mid-week analysis failed'
    await logAiGeneration({
      clientId: input.checkin.client_id,
      coachId: input.coachId ?? null,
      action: 'mid_week_analysis',
      model: MODELS.CLAUDE_HAIKU,
      latencyMs: Date.now() - started,
      promptTokens: null,
      completionTokens: null,
      retryCount: 0,
      validationResult: message,
      success: false,
      knowledgeRefs: null,
      renderedOutput: { checkinId: input.checkin.id },
    })
    throw err
  }
}
