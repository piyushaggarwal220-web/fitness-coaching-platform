/**
 * Mid-week check-in AI pack for coaches:
 * 1) Internal briefing (skim)
 * 2) Ready-to-send client reply (human coach voice, no hyphens)
 * Costs logged to ai_generation_logs (AI credits).
 */
import { MODELS } from '@/lib/ai/config'
import { generateClaudeResponse } from '@/lib/ai/anthropic'
import { logAiGeneration } from '@/lib/ai/trace-log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Checkin, OnboardingProfile } from '@/types/database'

export type MidWeekAiPack = {
  summary: string
  clientReply: string
  cached: boolean
}

function scoreLine(label: string, value: number | null | undefined): string {
  return `${label}: ${value != null ? `${value}/10` : 'n/a'}`
}

/** Hard cap for the client-facing mid-week WhatsApp reply. */
export const MIDWEEK_CLIENT_REPLY_MAX_WORDS = 40

/** Remove ASCII/Unicode hyphens and dashes from client-facing text. */
export function stripHyphensForCoachReply(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function countCoachReplyWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

/**
 * Enforce a hard word limit on the client reply.
 * Prefers ending on a sentence boundary inside the limit; otherwise hard-cuts.
 */
export function limitCoachReplyWords(
  text: string,
  maxWords: number = MIDWEEK_CLIENT_REPLY_MAX_WORDS
): string {
  const cleaned = stripHyphensForCoachReply(text)
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return cleaned

  const truncated = words.slice(0, maxWords).join(' ')
  const sentenceMatch = truncated.match(/^[\s\S]*[.!?](?=\s|$)/)
  if (sentenceMatch && countCoachReplyWords(sentenceMatch[0]) >= Math.min(20, maxWords)) {
    return sentenceMatch[0].trim()
  }
  return /[.!?]$/.test(truncated) ? truncated : `${truncated}.`
}

function finalizeClientReply(text: string): string {
  return limitCoachReplyWords(stripHyphensForCoachReply(text))
}

function firstName(profile: OnboardingProfile): string {
  const raw = profile.name?.trim() || ''
  if (!raw) return 'there'
  return raw.split(/\s+/)[0] || 'there'
}

function buildCheckinFacts(
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
    `Client full name: ${profile.name || profile.email || checkin.client_id}`,
    `Client first name: ${firstName(profile)}`,
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
    `Wins: ${checkin.adherence_wins?.trim() || 'n/a'}`,
    `Slips: ${checkin.adherence_struggles?.trim() || 'n/a'}`,
    `Pain/injuries: ${checkin.pain_injuries?.trim() || 'n/a'}`,
    `Questions: ${checkin.questions_for_coach?.trim() || 'n/a'}`,
    `Additional comments: ${checkin.notes?.trim() || 'n/a'}`,
    prevBlock,
  ]
    .filter((line) => line != null)
    .join('\n')
}

function buildPackUserPrompt(
  profile: OnboardingProfile,
  checkin: Checkin,
  previous?: Checkin | null
): string {
  return [
    buildCheckinFacts(profile, checkin, previous),
    '',
    'Produce TWO sections with the exact delimiters below.',
    '',
    '===COACH_BRIEFING===',
    'Internal only. Max 40 words total. Plain text, no fluff.',
    'Format exactly:',
    'Status: one short line on how the week is going',
    'Watch: one short line on the main risk or win',
    'Do: one short line on what the coach should do next',
    '',
    '===CLIENT_REPLY===',
    'WhatsApp style message the coach will paste and send.',
    'This is a MID-WEEK check-in reply, not a full weekly review.',
    'Rules for CLIENT_REPLY only:',
    `Address them as ${firstName(profile)}. Start with their name, then one short warm line.`,
    'Warm, direct, human Indian online coach tone. Sound like a real coach texting, not a report.',
    'Pick ONE concrete detail from their wins, slips, scores, questions, or comments. Do not be generic.',
    'Answer their questions briefly if any. Give at most 1 clear next action for the rest of the week.',
    'Keep it lighter and shorter than a Sunday weekly reply.',
    'Do not invent measurements, medical diagnoses, or plan rewrites.',
    'Do not mention AI, templates, or that this is automated.',
    'Do not use Markdown, asterisks, or bullet symbols.',
    'No corporate phrases like "great job staying consistent", "proud of you for", "keep crushing", "lean into", "prioritize recovery".',
    'CRITICAL: Never use hyphen, en dash, or em dash characters anywhere in CLIENT_REPLY. Use commas, periods, or new sentences instead.',
    `HARD LIMIT: CLIENT_REPLY must be at most ${MIDWEEK_CLIENT_REPLY_MAX_WORDS} words. Aim for 30 to 40 words. Never exceed ${MIDWEEK_CLIENT_REPLY_MAX_WORDS}.`,
    'One short WhatsApp style message. Ready to send as is.',
  ].join('\n')
}

const PACK_SYSTEM = [
  'You write short human coach texts for LURVOX.',
  'Output exactly two sections: ===COACH_BRIEFING=== then ===CLIENT_REPLY===.',
  'CLIENT_REPLY is a mid-week check-in reply: casual, specific, lighter than a weekly review, never AI sounding.',
  `CLIENT_REPLY hard max ${MIDWEEK_CLIENT_REPLY_MAX_WORDS} words.`,
  'COACH_BRIEFING must be under 40 words.',
  'Be concrete. Never invent facts not in the check-in.',
  'In CLIENT_REPLY never use any hyphen or dash character.',
].join(' ')

function extractSection(raw: string, marker: string, nextMarker?: string): string {
  const start = raw.indexOf(marker)
  if (start < 0) return ''
  const after = raw.slice(start + marker.length)
  if (!nextMarker) return after.trim()
  const end = after.indexOf(nextMarker)
  return (end >= 0 ? after.slice(0, end) : after).trim()
}

function parsePackOutput(raw: string): { summary: string; clientReply: string } {
  const trimmed = raw.trim()
  let summary = extractSection(trimmed, '===COACH_BRIEFING===', '===CLIENT_REPLY===')
  let clientReply = extractSection(trimmed, '===CLIENT_REPLY===')

  if (!summary && !clientReply) {
    // Legacy / library JSON path
    try {
      const start = trimmed.indexOf('{')
      const end = trimmed.lastIndexOf('}')
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(trimmed.slice(start, end + 1)) as {
          coach_notes?: unknown
          client_reply?: unknown
        }
        if (typeof parsed.coach_notes === 'string') summary = parsed.coach_notes.trim()
        if (typeof parsed.client_reply === 'string') clientReply = parsed.client_reply.trim()
      }
    } catch {
      summary = trimmed
    }
  }

  if (!clientReply && summary) {
    // If model only returned one blob, treat as briefing; reply must be regenerated later.
    clientReply = ''
  }

  return {
    summary: summary.trim(),
    clientReply: finalizeClientReply(clientReply),
  }
}

export async function loadCachedMidWeekPack(
  checkinId: string
): Promise<{ summary: string; clientReply: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ai_generation_logs')
    .select('rendered_output, created_at')
    .eq('action', 'mid_week_analysis')
    .eq('success', true)
    .contains('rendered_output', { checkinId })
    .order('created_at', { ascending: false })
    .limit(8)

  let bestSummary: string | null = null
  let bestReply: string | null = null

  for (const row of data ?? []) {
    const rendered = row.rendered_output as {
      checkinId?: string
      summary?: string
      clientReply?: string
    } | null
    if (rendered?.checkinId !== checkinId) continue
    if (!bestSummary && rendered.summary?.trim()) bestSummary = rendered.summary.trim()
    if (!bestReply && rendered.clientReply?.trim()) {
      bestReply = finalizeClientReply(rendered.clientReply)
    }
    if (bestSummary && bestReply) break
  }

  if (!bestSummary && !bestReply) return null
  return {
    summary: bestSummary ?? '',
    clientReply: bestReply ?? '',
  }
}

/** @deprecated Prefer loadCachedMidWeekPack */
export async function loadCachedMidWeekSummary(checkinId: string): Promise<string | null> {
  const pack = await loadCachedMidWeekPack(checkinId)
  return pack?.summary?.trim() || null
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
}): Promise<MidWeekAiPack> {
  if (!input.force) {
    const cached = await loadCachedMidWeekPack(input.checkin.id)
    if (cached?.summary?.trim() && cached.clientReply?.trim()) {
      return {
        summary: cached.summary,
        clientReply: cached.clientReply,
        cached: true,
      }
    }
  }

  const previous = await loadPreviousCheckin(input.checkin)
  // Keep pack format fixed; library templates tend to inflate length and sound AI.
  const systemPrompt = PACK_SYSTEM
  const userPrompt = buildPackUserPrompt(input.profile, input.checkin, previous)

  const started = Date.now()
  try {
    const result = await generateClaudeResponse({
      systemPrompt,
      userPrompt,
      model: MODELS.CLAUDE_HAIKU,
      maxTokens: 500,
      temperature: 0.55,
    })
    const parsed = parsePackOutput(result.text)
    if (!parsed.summary && !parsed.clientReply) throw new Error('Empty mid-week analysis')

    // If reply missing, one focused retry for client message only
    let clientReply = parsed.clientReply
    let summary = parsed.summary
    let retryCount = result.retryCount
    let inputTokens = result.inputTokens
    let outputTokens = result.outputTokens

    if (!clientReply.trim()) {
      const replyOnly = await generateClaudeResponse({
        systemPrompt: [
          'You are a real LURVOX coach texting a client on WhatsApp.',
          'Output ONLY the client message. No headings. No markdown.',
          'This is a mid-week check-in reply, not a full weekly review. Casual and specific.',
          'Never use hyphen, en dash, or em dash characters.',
          `Hard max ${MIDWEEK_CLIENT_REPLY_MAX_WORDS} words.`,
        ].join(' '),
        userPrompt: [
          buildCheckinFacts(input.profile, input.checkin, previous),
          '',
          `Write the mid-week client reply to ${firstName(input.profile)} now.`,
          'Warm, direct, human. One concrete detail from their check in. One next action max.',
          `HARD LIMIT: at most ${MIDWEEK_CLIENT_REPLY_MAX_WORDS} words. Aim for 30 to 40 words.`,
          'CRITICAL: zero hyphen or dash characters in the entire message.',
        ].join('\n'),
        model: MODELS.CLAUDE_HAIKU,
        maxTokens: 220,
        temperature: 0.5,
      })
      clientReply = finalizeClientReply(replyOnly.text)
      retryCount += 1 + replyOnly.retryCount
      inputTokens += replyOnly.inputTokens
      outputTokens += replyOnly.outputTokens
    }

    if (!summary.trim()) summary = 'Status: see reply. Watch: n/a. Do: send reply.'
    if (!clientReply.trim()) throw new Error('Empty mid-week client reply')

    clientReply = finalizeClientReply(clientReply)

    await logAiGeneration({
      clientId: input.checkin.client_id,
      coachId: input.coachId ?? null,
      action: 'mid_week_analysis',
      model: result.model,
      promptVersion: 'fallback-v4-brief-human',
      latencyMs: Date.now() - started,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      retryCount,
      validationResult: 'ok',
      success: true,
      knowledgeRefs: null,
      renderedOutput: {
        checkinId: input.checkin.id,
        summary,
        clientReply,
      },
    })

    return { summary, clientReply, cached: false }
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

/** Generate packs for unreviewed mid-week check-ins.
 *  When force=true, regenerates even if a reply already exists (for unsent ones).
 */
export async function backfillMidWeekReplies(input: {
  coachId?: string | null
  limit?: number
  force?: boolean
}): Promise<{
  total: number
  generated: number
  skipped: number
  failed: { checkinId: string; error: string }[]
}> {
  const admin = createAdminClient()
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 100)
  const force = Boolean(input.force)

  let query = admin
    .from('checkins')
    .select('*')
    .eq('checkin_type', 'mid_week')
    .eq('reviewed', false)
    .order('submitted_at', { ascending: true })
    .limit(limit)

  if (input.coachId) {
    query = query.eq('coach_id', input.coachId)
  }

  const { data: rows, error } = await query
  if (error) throw new Error(error.message)

  const checkins = (rows ?? []) as Checkin[]
  let generated = 0
  let skipped = 0
  const failed: { checkinId: string; error: string }[] = []

  for (const checkin of checkins) {
    try {
      if (!force) {
        const cached = await loadCachedMidWeekPack(checkin.id)
        if (cached?.clientReply?.trim()) {
          skipped += 1
          continue
        }
      }

      const { data: profile } = await admin
        .from('profiles')
        .select('*')
        .eq('id', checkin.client_id)
        .maybeSingle()

      if (!profile) {
        failed.push({ checkinId: checkin.id, error: 'Profile missing' })
        continue
      }

      await generateMidWeekAnalysis({
        profile: profile as OnboardingProfile,
        checkin,
        coachId: checkin.coach_id,
        force: true,
      })
      generated += 1
    } catch (err) {
      failed.push({
        checkinId: checkin.id,
        error: err instanceof Error ? err.message : 'Failed',
      })
    }
  }

  return {
    total: checkins.length,
    generated,
    skipped,
    failed,
  }
}
