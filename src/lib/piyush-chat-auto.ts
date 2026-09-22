import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import {
  buildNamedCoachSystemPrompt,
  truncatePlanExcerpt,
} from '@/lib/ai/coach-chat-persona'
import { autoCoachFirstName } from '@/lib/coach-delivery-policy'
import { markConversationRead, sendChatMessage } from '@/lib/coach-chat'

const HUMAN_ONLY =
  /\b(call me|phone (call|me)|video call|whatsapp call|speak to (you|piyush|rakshit|the coach)|talk to (you|piyush|rakshit|a human|the coach)|real (person|coach|human)|human coach|refund|cancel (my )?(plan|membership|subscription)|chargeback|lawyer|chest pain|suicid|kill myself|self.?harm|emergency|hospitalized)\b/i

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
  const type = input.messageType ?? input.message_type ?? 'text'
  if (type === 'voice') return true
  const text = input.content?.trim() ?? ''
  if (!text) return type === 'image'
  return HUMAN_ONLY.test(text)
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
  history: ChatRow[]
}): { systemPrompt: string; userPrompt: string } {
  const history = input.history
    .map((row) => {
      const who = row.sender_type === 'client' ? 'Client' : row.sender_type === 'coach' ? 'Coach' : 'System'
      const body = row.content?.trim() || `[${row.message_type || 'message'}]`
      return `${who}: ${body}`
    })
    .join('\n')

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
      mode: 'human_thread',
    }),
    userPrompt: [
      'Recent chat:',
      history || '(no prior messages)',
      '',
      'Write the next coach reply only: 1–2 short lines max (~40 words). No quotes. No hyphen characters. No bullet lists.',
    ].join('\n'),
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
    .select('name, fitness_goal, journey_summary, onboarding_data')
    .eq('id', input.clientId)
    .maybeSingle()

  const { data: plan } = await admin
    .from('plans')
    .select('title, nutrition_plan, workout_plan')
    .eq('client_id', input.clientId)
    .eq('active', true)
    .maybeSingle()

  const personalities =
    (profile?.onboarding_data as { goals?: { coachPersonalities?: string[] } } | null)?.goals
      ?.coachPersonalities ?? null

  const coachFirstName =
    input.coachFirstName?.trim() || autoCoachFirstName(input.coachId)

  const prompts = buildReplyPrompt({
    coachFirstName,
    name: profile?.name?.trim() || 'there',
    fitnessGoal: profile?.fitness_goal ?? null,
    journeySummary: profile?.journey_summary ?? null,
    planTitle: plan?.title ?? null,
    nutritionExcerpt: truncatePlanExcerpt(plan?.nutrition_plan),
    workoutExcerpt: truncatePlanExcerpt(plan?.workout_plan),
    personalities,
    history: chronological.slice(-12),
  })

  let reply: string
  try {
    const generated = await generateOpenAIResponse({
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      model: MODELS.GPT_LUNA,
      maxTokens: 95,
      temperature: 0.5,
    })
    reply = generated.text.replace(/[\u2010-\u2015\u2212-]/g, ' ').replace(/\s{2,}/g, ' ').trim()
  } catch (err) {
    return { status: 'failed', detail: err instanceof Error ? err.message : 'chat generation failed' }
  }

  if (!reply) return { status: 'failed', detail: 'empty reply' }

  const sent = await sendChatMessage(admin, {
    conversationId: input.conversationId,
    senderType: 'coach',
    senderId: input.coachUserId,
    content: reply,
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
