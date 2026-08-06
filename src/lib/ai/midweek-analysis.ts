/**
 * Mid-week check-in AI summary for coaches.
 * Uses Prompt Library category mid_week_analysis when published;
 * otherwise falls back to a concise coach-facing analysis prompt.
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

function buildFallbackUserPrompt(profile: OnboardingProfile, checkin: Checkin): string {
  return [
    `Client: ${profile.name || profile.email || checkin.client_id}`,
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
    '',
    'Write a short coach-facing briefing (not client-facing). Cover: trends, adherence risks, energy/sleep/stress flags, and 2–4 recommended focus points for the coach call. Plain text only.',
  ]
    .filter((line) => line != null)
    .join('\n')
}

const FALLBACK_SYSTEM = [
  'You are an expert fitness coach assistant.',
  'Summarize mid-week check-ins so a human coach can skim fast and reply with confidence.',
  'Be concrete, brief, and actionable. Do not invent measurements or photos that were not provided.',
  'Output plain text only — no JSON, no markdown fences.',
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

  const libraryPrompt = await getPublishedPromptByCategory('mid_week_analysis')
  const systemPrompt = libraryPrompt?.promptBody?.trim()
    ? `${FALLBACK_SYSTEM}\n\n# Library template\n${libraryPrompt.promptBody}\n\n${OUTPUT_INSTRUCTIONS}`
    : `${FALLBACK_SYSTEM}\n\n${OUTPUT_INSTRUCTIONS}`
  const userPrompt = buildFallbackUserPrompt(input.profile, input.checkin)

  const started = Date.now()
  try {
    const result = await generateClaudeResponse({
      systemPrompt,
      userPrompt,
      model: MODELS.CLAUDE_HAIKU,
      maxTokens: 900,
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
        : 'fallback-v1',
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
