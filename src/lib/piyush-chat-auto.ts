import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import {
  ASSISTANT_COACH_LABEL,
  buildNamedCoachSystemPrompt,
  clientTextForReply,
  coachReplyRequest,
  guardAssistantCoachReply,
} from '@/lib/ai/coach-chat-persona'
import { datedPlanRequestDirective } from '@/lib/ai/dated-plan-request'
import { loadAiCoachThreadContext } from '@/lib/ai/ai-coach-context'
import { autoCoachFirstName } from '@/lib/coach-delivery-policy'
import { markConversationRead, sendChatMessage } from '@/lib/coach-chat'
import { COACH_REPLY_QUIET_MS } from '@/lib/chat-reply-pause'

const MEDICAL_ONLY =
  /\b(chest pain|suicid|kill myself|self.?harm|emergency|hospitalized|can'?t breathe|cannot breathe)\b/i

type ChatRow = {
  id: string
  sender_type: string
  message_type: string | null
  content: string | null
  created_at: string
}

export function chatNeedsHumanCoach(input: {
  messageType?: string | null
  message_type?: string | null
  content?: string | null
}): boolean {
  const text = input.content?.trim() ?? ''
  return MEDICAL_ONLY.test(text)
}

function buildReplyPrompt(input: {
  coachFirstName: string
  name: string
  fitnessGoal: string | null
  journeySummary: string | null
  planTitle: string | null
  nutritionExcerpt: string | null
  workoutExcerpt: string | null
  personalities: string[] | null
  dietPreference?: string | null
  injuryNote?: string | null
  allergyNote?: string | null
  purchasedPlanLine?: string | null
  todayPlan?: string | null
  trackerLine?: string | null
  checkinLine?: string | null
  history: ChatRow[]
}): { systemPrompt: string; userPrompt: string; maxTokens: number } {
  const history = input.history
    .map((row) => {
      const who = row.sender_type === 'client' ? 'Client' : row.sender_type === 'coach' ? 'Coach' : 'System'
      const body = row.content?.trim() || `[${row.message_type || 'message'}]`
      return `${who}: ${body}`
    })
    .join('\n')

  const latestClientText = clientTextForReply(
    input.history.map((row) => ({
      fromClient: row.sender_type === 'client',
      content: row.content,
    }))
  )
  const dated = datedPlanRequestDirective(latestClientText)
  const hasCoachReply = input.history.some((row) => row.sender_type === 'coach')
  const replyRequest = coachReplyRequest({
    clientText: latestClientText,
    firstReply: !hasCoachReply,
  })

  return {
    systemPrompt: buildNamedCoachSystemPrompt({
      coachFirstName: input.coachFirstName,
      name: input.name,
      fitnessGoal: input.fitnessGoal,
      personalities: input.personalities,
      planTitle: input.planTitle,
      journeySummary: input.journeySummary,
      nutritionExcerpt: input.nutritionExcerpt,
      workoutExcerpt: input.workoutExcerpt,
      dietPreference: input.dietPreference,
      injuryNote: input.injuryNote,
      allergyNote: input.allergyNote,
      purchasedPlanLine: input.purchasedPlanLine,
      todayPlan: input.todayPlan,
      trackerLine: input.trackerLine,
      checkinLine: input.checkinLine,
      mode: 'human_thread',
    }),
    userPrompt: [
      'Recent chat:',
      history || '(no prior messages)',
      dated ? `\n${dated}` : '',
      '',
      'Write the next coach reply only.',
      replyRequest.instruction,
    ].join('\n'),
    maxTokens: replyRequest.maxTokens,
  }
}

export async function autoReplyUnreadChat(
  admin: SupabaseClient,
  input: {
    conversationId: string
    clientId: string
    coachUserId: string
    coachId?: string | null
    coachFirstName?: string | null
    /** Skip the pause so a client can ask for a reply after 2–3 messages. */
    force?: boolean
  }
): Promise<{ status: 'sent' | 'skipped' | 'failed'; detail: string }> {
  const { data: messages, error } = await admin
    .from('conversation_messages')
    .select('id, sender_type, message_type, content, created_at, read_at')
    .eq('conversation_id', input.conversationId)
    .order('created_at', { ascending: false })
    .limit(16)

  if (error) return { status: 'failed', detail: error.message }

  const chronological = [...(messages ?? [])].reverse() as ChatRow[]
  const latestClient = [...chronological].reverse().find((row) => row.sender_type === 'client')
  if (!latestClient) return { status: 'skipped', detail: 'no unread client message' }

  if (!input.force) {
    const sentAt = new Date(latestClient.created_at).getTime()
    if (Number.isFinite(sentAt) && Date.now() - sentAt < COACH_REPLY_QUIET_MS - 400) {
      return { status: 'skipped', detail: 'waiting_for_more' }
    }
  }

  // Already answered after this client message (instant reply or coach).
  const answeredAfter = chronological.some(
    (row) =>
      row.sender_type === 'coach' &&
      row.message_type !== 'system' &&
      row.created_at > latestClient.created_at
  )
  if (answeredAfter) return { status: 'skipped', detail: 'already_replied' }

  if (chatNeedsHumanCoach(latestClient)) {
    return { status: 'skipped', detail: 'needs_human' }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('name, fitness_goal, journey_summary, onboarding_data, diet_preference, injuries, checkin_schedule_started_at, checkin_overdue, coach_service')
    .eq('id', input.clientId)
    .maybeSingle()

  const personalities =
    (profile?.onboarding_data as { goals?: { coachPersonalities?: string[] } } | null)?.goals
      ?.coachPersonalities ?? null

  const thread = await loadAiCoachThreadContext(admin, input.clientId, profile ?? {})

  const coachFirstName =
    input.coachFirstName?.trim() || autoCoachFirstName(input.coachId)

  const prompts = buildReplyPrompt({
    coachFirstName,
    name: profile?.name?.trim() || 'there',
    fitnessGoal: profile?.fitness_goal ?? null,
    journeySummary: profile?.journey_summary ?? null,
    planTitle: thread.planTitle,
    nutritionExcerpt: thread.nutritionExcerpt,
    workoutExcerpt: thread.workoutExcerpt,
    dietPreference: thread.dietPreference,
    injuryNote: thread.injuryNote,
    allergyNote: thread.allergyNote,
    purchasedPlanLine: thread.purchasedPlanLine,
    todayPlan: thread.todayPlan,
    trackerLine: thread.trackerLine,
    checkinLine: thread.checkinLine,
    personalities,
    history: chronological.slice(-12),
  })

  let reply: string
  try {
    const generated = await generateOpenAIResponse({
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      model: MODELS.GPT_LUNA,
      maxTokens: prompts.maxTokens,
      temperature: 0.5,
    })
    reply = guardAssistantCoachReply(
      generated.text.replace(/[\u2010-\u2015\u2212-]/g, ' ')
    )
  } catch (err) {
    return { status: 'failed', detail: err instanceof Error ? err.message : 'chat generation failed' }
  }

  if (!reply) return { status: 'failed', detail: 'empty reply' }

  const sent = await sendChatMessage(admin, {
    conversationId: input.conversationId,
    senderType: 'coach',
    senderId: input.coachUserId,
    content: reply.replace(new RegExp(`^${ASSISTANT_COACH_LABEL}:\\s*`, 'i'), ''),
    notificationTitle: 'Coach replied',
  })
  if (sent.error) return { status: 'failed', detail: sent.error }

  await markConversationRead(admin, input.conversationId, 'coach', latestClient.created_at)
  return { status: 'sent', detail: 'replied' }
}

/** @deprecated Use autoReplyUnreadChat — works for Piyush and Rakshit. */
export async function autoReplyPiyushUnreadChat(
  admin: SupabaseClient,
  input: {
    conversationId: string
    clientId: string
    coachUserId: string
    coachId?: string | null
    coachFirstName?: string | null
  }
): Promise<{ status: 'sent' | 'skipped' | 'failed'; detail: string }> {
  return autoReplyUnreadChat(admin, input)
}
