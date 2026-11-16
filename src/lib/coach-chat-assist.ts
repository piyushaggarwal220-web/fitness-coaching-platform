import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MODELS } from '@/lib/ai/config'
import { editPlanSection } from '@/lib/ai/edit-plan-section'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { activatePlan, getNextPlanVersion } from '@/lib/plans'
import type { OnboardingProfile, Plan } from '@/types/database'

type AssistDecision = {
  updatePlan: boolean
  instruction: string
  coachNote: string
  summary: string
}

function clip(value: string | null | undefined, max: number): string {
  const text = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

async function loadChatContext(
  admin: SupabaseClient,
  clientId: string,
  conversationId: string,
  messageIds?: string[]
) {
  const messageQuery = admin
    .from('conversation_messages')
    .select('id, sender_type, content, created_at')
    .eq('conversation_id', conversationId)
  const messagesPromise =
    messageIds == null
      ? messageQuery.order('created_at', { ascending: false }).limit(40)
      : messageIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : messageQuery.in('id', messageIds)

  const [{ data: messages, error: messageError }, { data: checkins }, { data: plan }, { data: profile }] =
    await Promise.all([
    messagesPromise,
    admin
      .from('checkins')
      .select('checkin_type, coaching_week, submitted_at, weight, questions_for_coach, progress_notes, adherence_wins, adherence_struggles, pain_injuries')
      .eq('client_id', clientId)
      .order('submitted_at', { ascending: false })
      .limit(4),
    admin
      .from('plans')
      .select('*')
      .eq('client_id', clientId)
      .eq('active', true)
      .maybeSingle(),
    admin.from('profiles').select('*').eq('id', clientId).maybeSingle(),
  ])

  if (messageError) throw new Error(`Could not read the selected messages: ${messageError.message}`)
  if (messageIds && messageIds.length > 0 && (messages ?? []).length === 0) {
    throw new Error('Those messages are not in this chat.')
  }

  const transcript = [...(messages ?? [])]
    .sort((a, b) => new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime())
    .map((row) => {
      const who = row.sender_type === 'client' ? 'Client' : row.sender_type === 'coach' ? 'Coach' : 'Note'
      return `${who}: ${clip(row.content as string | null, 700) || '(attachment)'}`
    })
    .join('\n')

  const checkinText = (checkins ?? [])
    .map((row) => {
      const kind = row.checkin_type === 'mid_week' ? 'Mid-week' : 'Weekly'
      return [
        `${kind} week ${row.coaching_week ?? '?'}:`,
        row.weight ? `weight ${row.weight}` : '',
        clip(row.questions_for_coach as string | null, 400),
        clip(row.progress_notes as string | null, 400),
        clip(row.adherence_wins as string | null, 300),
        clip(row.adherence_struggles as string | null, 300),
        clip(row.pain_injuries as string | null, 300),
      ]
        .filter(Boolean)
        .join(' ')
    })
    .join('\n')

  return {
    transcript,
    checkinText,
    plan: (plan as Plan | null) ?? null,
    profile: (profile as OnboardingProfile | null) ?? null,
  }
}

export async function summarizeCoachChat(
  admin: SupabaseClient,
  input: { clientId: string; conversationId: string }
): Promise<string> {
  const context = await loadChatContext(admin, input.clientId, input.conversationId)
  const generated = await generateOpenAIResponse({
    systemPrompt: [
      'You write a private note for the coach. The client never sees it.',
      'Summarize what this client has said in coach chat and in the latest check-ins.',
      'Include requests to change diet, training, running, or schedule.',
      'Plain sentences. Do not address the client. Do not call yourself an AI.',
    ].join(' '),
    userPrompt: `Chat:\n${context.transcript || '(no messages yet)'}\n\nCheck-ins:\n${context.checkinText || '(none)'}`,
    model: MODELS.GPT_LUNA,
    maxTokens: 500,
    temperature: 0.3,
  })
  const summary = generated.text.trim()
  if (!summary) throw new Error('Summary came back empty.')
  return summary
}

class TruncatedPlanDecisionError extends Error {
  constructor() {
    super('The plan decision was cut off before it finished.')
    this.name = 'TruncatedPlanDecisionError'
  }
}

function parseDecision(raw: string): AssistDecision {
  const trimmed = raw.trim()
  const jsonText = trimmed.startsWith('{') ? trimmed : trimmed.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonText) throw new Error('Could not read the plan decision.')
  let parsed: Partial<AssistDecision>
  try {
    parsed = JSON.parse(jsonText) as Partial<AssistDecision>
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : ''
    if (/unterminated string|unexpected end of json/i.test(detail)) {
      throw new TruncatedPlanDecisionError()
    }
    throw new Error('Could not read the plan decision.')
  }
  return {
    updatePlan: parsed.updatePlan === true,
    instruction: typeof parsed.instruction === 'string' ? parsed.instruction.trim() : '',
    coachNote: typeof parsed.coachNote === 'string' ? parsed.coachNote.trim() : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
  }
}

export async function publishPlanFromCoachChat(
  admin: SupabaseClient,
  input: {
    clientId: string
    conversationId: string
    coachId: string
    messageIds: string[]
    coachComment: string
  }
): Promise<{ updated: boolean; planId: string | null; summary: string }> {
  const coachComment = input.coachComment.trim()
  const context = await loadChatContext(admin, input.clientId, input.conversationId, input.messageIds)
  if (!context.profile) throw new Error('Client profile was not found.')
  if (context.profile.coach_id !== input.coachId) throw new Error('This client is not assigned to you.')
  if (!context.plan?.nutrition_plan?.trim() && !context.plan?.workout_plan?.trim()) {
    throw new Error('This client has no active plan to update.')
  }

  const decisionPrompt = {
    systemPrompt: [
      'Return JSON only, with keys updatePlan, instruction, coachNote, summary.',
      'Keep every value on one line. Do not put raw line breaks inside strings.',
      'summary is a private note for the coach, at most 60 words.',
      'The selected messages are the only chat reference. Do not use requests that are not in that list.',
      'The coach comments are instructions from the coach. Follow them.',
      'updatePlan is true when a selected message or a coach comment asks to change diet, training, running, steps, or schedule.',
      'instruction tells an editor exactly what to change and what to leave alone, at most 120 words. Include the coach comments.',
      'coachNote is 2 to 4 sentences the client will read, written as their coach.',
      'Never say AI, Smart Coach, bot, or draft.',
    ].join(' '),
    userPrompt: `Selected messages:\n${context.transcript || '(none selected)'}\n\nCoach comments:\n${coachComment || '(none)'}\n\nCheck-ins, including mid-week inside the week:\n${context.checkinText || '(none)'}`,
    model: MODELS.GPT_LUNA,
    temperature: 0.2,
  }
  // 700 output tokens is shared with reasoning and cuts this JSON mid-string
  // (the coach then sees "Unterminated string in JSON").
  let generated = await generateOpenAIResponse({ ...decisionPrompt, maxTokens: 4000 })
  let decision: AssistDecision
  try {
    decision = parseDecision(generated.text)
  } catch (error) {
    if (!(error instanceof TruncatedPlanDecisionError) && generated.stopReason !== 'max_tokens') {
      throw error
    }
    generated = await generateOpenAIResponse({ ...decisionPrompt, maxTokens: 8000 })
    decision = parseDecision(generated.text)
  }
  const summary = decision.summary || 'No summary was returned.'
  const instruction = [decision.instruction, coachComment ? `Coach comment: ${coachComment}` : '']
    .filter(Boolean)
    .join(' ')
  if ((!decision.updatePlan && !coachComment) || !instruction) {
    return { updated: false, planId: null, summary }
  }

  const active = context.plan
  const shared = {
    coachInstruction: instruction,
    editSource: 'coach' as const,
    remakeFromScratch: false,
    clientId: context.profile.id,
    clientName: context.profile.name,
    profile: context.profile,
  }
  const nutrition = await editPlanSection({
    section: 'nutrition',
    currentText: active.nutrition_plan ?? '',
    ...shared,
  })
  const workout = await editPlanSection({
    section: 'workout',
    currentText: active.workout_plan ?? '',
    ...shared,
  })

  const now = new Date().toISOString()
  const version = await getNextPlanVersion(admin, input.clientId)
  const coachNote = decision.coachNote || 'Your plan is updated from what you sent in chat.'
  const { data: created, error: insertError } = await admin
    .from('plans')
    .insert({
      client_id: input.clientId,
      coach_id: input.coachId,
      title: 'Updated Plan',
      phase: active.phase,
      workout_plan: workout.revisedText,
      nutrition_plan: nutrition.revisedText,
      cardio_plan: active.cardio_plan,
      supplement_plan: active.supplement_plan,
      coach_notes: coachNote,
      version,
      active: false,
      delivered_at: null,
      updated_at: now,
    })
    .select('id')
    .single()

  if (insertError || !created) throw new Error(insertError?.message ?? 'The updated plan could not be saved.')

  const published = await activatePlan(admin, {
    id: created.id as string,
    client_id: input.clientId,
    coach_id: input.coachId,
  })
  if (published.error) {
    await admin.from('plans').delete().eq('id', created.id)
    throw new Error(published.error)
  }

  return { updated: true, planId: created.id as string, summary }
}
