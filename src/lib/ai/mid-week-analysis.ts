/**
 * Coach-only mid-week AI brief + suggested chat reply.
 * Never creates a plan draft and never posts client-visible content.
 */
import { MODELS } from '@/lib/ai/config'
import { calculateComplexityScore } from '@/lib/ai/complexity-score'
import { getAllKnowledge } from '@/lib/ai/knowledge'
import { compileCachedPrompt } from '@/lib/ai/prompt-cache'
import {
  formatLibraryPromptVersion,
  getPublishedPromptByCategory,
} from '@/lib/ai/prompt-library-loader'
import { callPlanProvider, getPlanProviderMode } from '@/lib/ai/plan-provider'
import { profileToComplexityInput } from '@/lib/complexity/profile-input'
import {
  formatMidWeekAiChatMessage,
  parseMidWeekAiSuggestedReply,
} from '@/lib/checkin-chat'
import { postMidWeekAiSuggestionToChat } from '@/lib/coach-chat'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile, Plan } from '@/types/database'

const FALLBACK_ACTION_TEMPLATE = [
  'Analyze this mid-week check-in for the coach only.',
  'Focus on adherence, energy/sleep/stress/hunger flags, pain, and the client question.',
  'Recommend a short coaching focus for the rest of the week.',
  'Also draft a warm, concise client-facing reply the coach can send in chat.',
  'Do not create or change any workout or nutrition plan.',
].join(' ')

const OUTPUT_INSTRUCTIONS = [
  '# Output Format',
  'You MUST respond with ONLY valid JSON — no markdown fences, no commentary.',
  '{ "analysis": "<coach-facing brief with trends, flags, and recommended focus>",',
  '  "suggested_reply": "<warm client-facing message the coach can send in chat>" }',
  'analysis is for the coach only. suggested_reply must sound human and never mention AI.',
].join('\n')

export type MidWeekAiSuggestion = {
  analysis: string
  suggestedReply: string
}

function buildFallbackSuggestion(profile: OnboardingProfile, checkin: Checkin): MidWeekAiSuggestion {
  const name = profile.name?.trim() || 'there'
  const week = checkin.coaching_week ? `Week ${checkin.coaching_week}` : 'this week'
  const flags: string[] = []
  if ((checkin.energy_level ?? 10) <= 4) flags.push('low energy')
  if ((checkin.sleep_quality ?? 10) <= 4) flags.push('poor sleep')
  if ((checkin.stress_level ?? 0) >= 7) flags.push('elevated stress')
  if ((checkin.hunger_level ?? 5) >= 8) flags.push('high hunger')
  if (checkin.pain_injuries?.trim()) flags.push('pain/injury note')

  const analysis = [
    `Mid-week scan for ${name} (${week}).`,
    `Diet ${checkin.diet_adherence ?? '—'}/10 · Workout ${checkin.workout_adherence ?? '—'}/10.`,
    flags.length ? `Flags: ${flags.join(', ')}.` : 'No major red flags from scores.',
    checkin.questions_for_coach?.trim()
      ? `Client question: ${checkin.questions_for_coach.trim()}`
      : 'No direct question logged.',
    'Recommended focus: acknowledge effort, answer any question, and give one clear next-step.',
  ].join('\n')

  const suggestedReply = [
    `Hi ${name} — thanks for the mid-week check-in.`,
    checkin.adherence_wins?.trim()
      ? `Great to see this win: ${checkin.adherence_wins.trim()}.`
      : 'Appreciate you staying consistent this week.',
    checkin.questions_for_coach?.trim()
      ? `On your question: I'll keep guidance simple — stay with the current plan and focus on recovery/consistency for the next few days.`
      : 'Stay with the current plan for now and keep the next few days simple and consistent.',
    'Message me if anything feels off before the weekly check-in.',
  ].join(' ')

  return { analysis, suggestedReply }
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function parseMidWeekAiResponse(text: string): MidWeekAiSuggestion | null {
  const parsed = extractJsonObject(text)
  if (!parsed || typeof parsed !== 'object') return null
  const row = parsed as Record<string, unknown>
  const analysis = typeof row.analysis === 'string' ? row.analysis.trim() : ''
  const suggestedReply =
    typeof row.suggested_reply === 'string'
      ? row.suggested_reply.trim()
      : typeof row.suggestedReply === 'string'
        ? row.suggestedReply.trim()
        : ''
  if (!analysis || !suggestedReply) return null
  return { analysis, suggestedReply }
}

export async function generateMidWeekCoachSuggestion(input: {
  profile: OnboardingProfile
  checkin: Checkin
  activePlan?: Plan | null
}): Promise<MidWeekAiSuggestion> {
  if (input.checkin.checkin_type !== 'mid_week') {
    throw new Error('Mid-week AI suggestions are only for mid-week check-ins.')
  }

  const analysisPrompt =
    (await getPublishedPromptByCategory('mid_week_analysis')) ??
    ({
      slug: 'fallback-mid-week-analysis',
      name: 'Mid-week Analysis Fallback',
      category: 'mid_week_analysis' as const,
      version: 0,
      promptBody: FALLBACK_ACTION_TEMPLATE,
    })

  const systemPrompt = await getPublishedPromptByCategory('system_prompt')
  const { data: knowledgeEntries, error: knowledgeError } = await getAllKnowledge()
  if (knowledgeError) {
    throw new Error(`Failed to load knowledge base: ${knowledgeError}`)
  }

  const complexityScore = calculateComplexityScore(
    profileToComplexityInput(input.profile, input.checkin)
  )

  const { result: compiled } = await compileCachedPrompt({
    profile: input.profile,
    latestCheckin: input.checkin,
    complexityScore,
    knowledgeEntries,
    activePlan: input.activePlan ?? null,
    actionTemplate: analysisPrompt.promptBody,
    systemTemplate: systemPrompt?.promptBody ?? null,
    clientId: input.profile.id,
    promptVersion: formatLibraryPromptVersion(analysisPrompt),
  })

  const system = `${compiled.systemPrompt}\n\n${OUTPUT_INSTRUCTIONS}`
  const providerMode = getPlanProviderMode()
  const fallback = buildFallbackSuggestion(input.profile, input.checkin)
  const mockText = JSON.stringify({
    analysis: fallback.analysis,
    suggested_reply: fallback.suggestedReply,
  })

  try {
    const response = await callPlanProvider(providerMode, {
      systemPrompt: system,
      userPrompt: compiled.userPrompt,
      model: MODELS.CLAUDE_HAIKU,
      maxTokens: 1024,
      temperature: 0.35,
      mockText,
    })

    const suggestion = parseMidWeekAiResponse(response.text)
    if (!suggestion) {
      throw new Error('Mid-week AI returned invalid JSON.')
    }
    return suggestion
  } catch {
    return fallback
  }
}

/**
 * Generate (if needed) and post a coach-only AI brief for a mid-week check-in.
 * Idempotent per check-in via related_checkin_id unique index.
 */
export async function generateAndPostMidWeekAiSuggestion(input: {
  clientId: string
  coachId: string
  checkinId: string
  conversationId?: string | null
}): Promise<{ posted: boolean; error: string | null; content?: string }> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('conversation_messages')
    .select('id, content')
    .eq('related_checkin_id', input.checkinId)
    .eq('coach_only', true)
    .maybeSingle()

  if (existing?.id) {
    return { posted: false, error: null, content: existing.content ?? undefined }
  }

  const { data: checkin, error: checkinError } = await admin
    .from('checkins')
    .select('*')
    .eq('id', input.checkinId)
    .maybeSingle()

  if (checkinError || !checkin) {
    return { posted: false, error: checkinError?.message ?? 'Check-in not found.' }
  }

  const checkinTyped = checkin as Checkin
  if (checkinTyped.checkin_type !== 'mid_week') {
    return { posted: false, error: null }
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', input.clientId)
    .maybeSingle()

  if (profileError || !profile) {
    return { posted: false, error: profileError?.message ?? 'Profile not found.' }
  }

  const { data: activePlan } = await admin
    .from('plans')
    .select('*')
    .eq('client_id', input.clientId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const suggestion = await generateMidWeekCoachSuggestion({
    profile: profile as OnboardingProfile,
    checkin: checkinTyped,
    activePlan: (activePlan as Plan | null) ?? null,
  })

  const content = formatMidWeekAiChatMessage(suggestion)
  // Keep parse helper honest in production paths.
  if (!parseMidWeekAiSuggestedReply(content)) {
    return { posted: false, error: 'Failed to format mid-week AI suggestion.' }
  }

  const posted = await postMidWeekAiSuggestionToChat({
    clientId: input.clientId,
    coachId: input.coachId,
    checkinId: input.checkinId,
    content,
    conversationId: input.conversationId,
  })

  if (posted.error) {
    return { posted: false, error: posted.error }
  }

  return { posted: true, error: null, content }
}
