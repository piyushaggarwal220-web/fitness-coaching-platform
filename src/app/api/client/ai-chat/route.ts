import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import { loadAiCoachThreadContext } from '@/lib/ai/ai-coach-context'
import {
  buildNamedCoachSystemPrompt,
  clientTextForReply,
  coachReplyRequest,
  guardAssistantCoachReply,
} from '@/lib/ai/coach-chat-persona'
import {
  buildCoachMemoryUpdatePrompt,
  clipCoachMemory,
  readClientMood,
} from '@/lib/ai/coach-chat-memory'
import {
  chatLanguageDirective,
  explicitChatLanguage,
  parseChatLanguage,
  type ChatLanguage,
} from '@/lib/ai/coach-chat-language'
import { ownVoicePath, transcribeChatVoice } from '@/lib/ai/transcribe-chat-voice'
import { datedPlanRequestDirective } from '@/lib/ai/dated-plan-request'
import {
  extractPlanChangeProposal,
  isPlanChangeCancel,
  isPlanChangeConfirm,
  loadPendingPlanChange,
  lockAndProcessPlanChangeFromChat,
  planChangeChatInstruction,
  savePendingPlanChange,
  stripPlanChangeTrailer,
  wantsPlanChangeAppliedNow,
  withConfirmCue,
} from '@/lib/ai/ai-coach-plan-change'
import { chatNeedsHumanCoach } from '@/lib/piyush-chat-auto'
import { chatTextForModel, decodeChatVoice, encodeChatVoice } from '@/lib/chat-reply-pause'
import { memberFacingCoachFirstName } from '@/lib/coach-delivery-policy'
import { assertInstantFeatureAccess } from '@/lib/instant-feature-guard'
import { getPlanChangeQuota } from '@/lib/plan-change-requests'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 120

type ChatTurn = { role: 'user' | 'assistant'; content: string }

const MAX_HISTORY = 16
const MAX_MESSAGE_LEN = 1200

async function coachNameForClient(
  admin: ReturnType<typeof createAdminClient>,
  profile: { coach_id?: string | null; coach_service?: string | null }
): Promise<string> {
  const known = memberFacingCoachFirstName(profile.coach_id, profile.coach_service)
  if (known !== 'your coach') return known
  if (!profile.coach_id) return 'Rakshit'
  const { data } = await admin.from('coaches').select('name').eq('id', profile.coach_id).maybeSingle()
  const first = data?.name?.trim().split(/\s+/)[0]
  return first || 'Rakshit'
}

async function earlierCoachThread(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<ChatTurn[]> {
  const { data: conv } = await admin
    .from('coach_conversations')
    .select('id')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!conv?.id) return []
  const { data: rows } = await admin
    .from('conversation_messages')
    .select('sender_type, content, message_type')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true })
    .limit(40)
  return (rows ?? []).flatMap((row) => {
    if (row.message_type && row.message_type !== 'text') return []
    const content = row.content?.trim()
    if (!content) return []
    if (row.sender_type !== 'client' && row.sender_type !== 'coach') return []
    return [{ role: row.sender_type === 'client' ? 'user' as const : 'assistant' as const, content }]
  })
}

async function loadCoachMemory(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<{ summary: string; replyLanguage: ChatLanguage }> {
  const { data, error } = await admin
    .from('ai_coach_memory')
    .select('summary, reply_language')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !data) return { summary: '', replyLanguage: 'hinglish' }
  return {
    summary: data.summary?.trim() ?? '',
    replyLanguage: parseChatLanguage(data.reply_language) ?? 'hinglish',
  }
}

async function saveReplyLanguage(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  language: ChatLanguage
): Promise<void> {
  const { data } = await admin
    .from('ai_coach_memory')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (data) {
    await admin
      .from('ai_coach_memory')
      .update({ reply_language: language, updated_at: new Date().toISOString() })
      .eq('client_id', clientId)
    return
  }
  await admin.from('ai_coach_memory').insert({
    client_id: clientId,
    summary: '',
    mood: 'plain',
    reply_language: language,
  })
}

async function olderChatForFirstMemory(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<string> {
  const { data } = await admin
    .from('ai_coach_messages')
    .select('role, content')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .range(MAX_HISTORY, MAX_HISTORY + 40)
  const rows = [...(data ?? [])].reverse()
  return rows
    .map((row) => `${row.role === 'user' ? 'Client' : 'Coach'}: ${chatTextForModel(row.content)}`)
    .join('\n')
    .slice(0, 4000)
}

async function saveCoachMemory(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  input: { previous: string; turns: string; mood: string }
): Promise<void> {
  const older = input.previous ? '' : await olderChatForFirstMemory(admin, clientId)
  const prompt = buildCoachMemoryUpdatePrompt({
    previous: input.previous,
    turns: input.turns,
    older,
  })
  const result = await generateOpenAIResponse({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    model: MODELS.GPT_LUNA,
    maxTokens: 350,
    temperature: 0.3,
  })
  const summary = clipCoachMemory(result.text)
  if (!summary) return
  await admin.from('ai_coach_memory').upsert({
    client_id: clientId,
    summary,
    mood: input.mood,
    updated_at: new Date().toISOString(),
  })
}

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select(
      'id, coach_service, coach_id, instant_gates_enabled, addon_ai_chat_entitled, access_source, payment_confirmed, onboarding_data'
    )
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json({ error: 'Membership required' }, { status: 403 })
  }

  const denied = await assertInstantFeatureAccess(auth.user.id, profile, 'ai_chat')
  if (denied) return denied

  const admin = createAdminClient()
  const [{ data: rows }, earlier, coachFirstName] = await Promise.all([
    admin
      .from('ai_coach_messages')
      .select('id, role, content, created_at')
      .eq('client_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(80),
    earlierCoachThread(admin, auth.user.id),
    coachNameForClient(admin, profile),
  ])

  const messages = [
    ...earlier.map((turn, index) => ({
      id: `earlier-${index}`,
      role: turn.role,
      content: turn.content,
      created_at: null,
    })),
    ...(rows ?? []),
  ]

  const memory = await loadCoachMemory(admin, auth.user.id)

  return NextResponse.json({
    messages,
    coachFirstName,
    coachId: profile.coach_id,
    replyLanguage: memory.replyLanguage,
  })
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  let body: { message?: string; replyNow?: boolean; language?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = (body.message || '').trim()
  const replyNow = body.replyNow === true
  const requestedLanguage = parseChatLanguage(body.language)
  if (!message && !replyNow && !requestedLanguage) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select(
      'id, name, fitness_goal, diet_preference, injuries, checkin_schedule_started_at, checkin_overdue, coach_service, coach_id, journey_summary, onboarding_data, instant_gates_enabled, addon_ai_chat_entitled, access_source, payment_confirmed, plan_delivered, role, subscription_expires_at'
    )
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json({ error: 'Membership required' }, { status: 403 })
  }

  const denied = await assertInstantFeatureAccess(auth.user.id, profile, 'ai_chat')
  if (denied) return denied

  const admin = createAdminClient()
  if (requestedLanguage && !message && !replyNow) {
    await saveReplyLanguage(admin, auth.user.id, requestedLanguage)
    return NextResponse.json({ replyLanguage: requestedLanguage })
  }

  const now = new Date().toISOString()
  const [coachFirstName, earlier] = await Promise.all([
    coachNameForClient(admin, profile),
    earlierCoachThread(admin, auth.user.id),
  ])

  let storedMessage = message
  if (message) {
    const voice = decodeChatVoice(message)
    if (voice.audioPath && ownVoicePath(voice.audioPath, auth.user.id) && !voice.text) {
      const transcript = await transcribeChatVoice(admin, voice.audioPath).catch(() => null)
      storedMessage = encodeChatVoice(voice.audioPath, transcript ?? '')
    }
  }

  if (storedMessage) {
    const { error: userInsertError } = await admin.from('ai_coach_messages').insert({
      client_id: auth.user.id,
      role: 'user',
      content: storedMessage,
      created_at: now,
    })
    if (userInsertError) {
      return NextResponse.json(
        { error: userInsertError.message || 'Could not save message' },
        { status: 500 }
      )
    }
  }

  if (storedMessage && chatNeedsHumanCoach({ content: chatTextForModel(storedMessage) })) {
    const { data: heldRow, error: heldError } = await admin
      .from('ai_coach_messages')
      .insert({
        client_id: auth.user.id,
        role: 'assistant',
        content:
          'If this is a medical emergency, contact local emergency services. For your plan, tell me what you can still do today.',
        created_at: new Date().toISOString(),
      })
      .select('id, role, content, created_at')
      .single()
    if (heldError || !heldRow) {
      return NextResponse.json({ error: heldError?.message ?? 'Could not save message' }, { status: 500 })
    }
    return NextResponse.json({ message: heldRow, coachFirstName })
  }

  if (!replyNow) {
    return NextResponse.json({ pending: true, coachFirstName })
  }

  const { data: historyRows } = await admin
    .from('ai_coach_messages')
    .select('role, content')
    .eq('client_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY)

  const history = ([...(historyRows ?? [])].reverse() as ChatTurn[]).filter(
    (row) => row.role === 'user' || row.role === 'assistant'
  )

  const personalities =
    (profile.onboarding_data as { goals?: { coachPersonalities?: string[] } } | null)?.goals
      ?.coachPersonalities ?? null

  const thread = await loadAiCoachThreadContext(admin, auth.user.id, profile)
  const memory = await loadCoachMemory(admin, auth.user.id)
  const clientLines = history
    .filter((turn) => turn.role === 'user')
    .slice(-6)
    .map((turn) => chatTextForModel(turn.content))
  const mood = readClientMood(clientLines)
  const pendingText = clientTextForReply(
    history.map((turn) => ({
      fromClient: turn.role === 'user',
      content: chatTextForModel(turn.content),
    }))
  )
  const latestClientText = pendingText || chatTextForModel(storedMessage || message)
  const replyLanguage =
    explicitChatLanguage(latestClientText) ?? requestedLanguage ?? memory.replyLanguage
  if (replyLanguage !== memory.replyLanguage) {
    await saveReplyLanguage(admin, auth.user.id, replyLanguage).catch(() => undefined)
  }

  const pendingChange = await loadPendingPlanChange(admin, auth.user.id)
  const quota = await getPlanChangeQuota(auth.user.id)

  const saveAssistant = async (content: string) => {
    const { data: assistantRow, error: assistantError } = await admin
      .from('ai_coach_messages')
      .insert({
        client_id: auth.user.id,
        role: 'assistant',
        content,
        created_at: new Date().toISOString(),
      })
      .select('id, role, content, created_at')
      .single()
    if (assistantError || !assistantRow) {
      return NextResponse.json(
        { error: assistantError?.message ?? 'Could not save message' },
        { status: 500 }
      )
    }
    try {
      await saveCoachMemory(admin, auth.user.id, {
        previous: memory.summary,
        turns: [`Client: ${latestClientText}`, `Coach: ${content}`].join('\n'),
        mood: mood.mood,
      })
    } catch {
      // Reply already saved.
    }
    return NextResponse.json({ message: assistantRow, coachFirstName })
  }

  if (pendingChange && isPlanChangeCancel(latestClientText)) {
    await savePendingPlanChange(admin, auth.user.id, null)
    return saveAssistant('Okay — I left the written plan as it is. Tell me if you want a different edit.')
  }

  if (pendingChange && isPlanChangeConfirm(latestClientText)) {
    const result = await lockAndProcessPlanChangeFromChat({
      clientId: auth.user.id,
      profile,
      pending: pendingChange,
    })
    await savePendingPlanChange(admin, auth.user.id, null)
    return saveAssistant(result.message)
  }

  if (!pendingChange && wantsPlanChangeAppliedNow(latestClientText) && !datedPlanRequestDirective(latestClientText)) {
    const transcript = [...earlier.slice(-8), ...history]
      .map((turn) => `${turn.role === 'user' ? 'Client' : 'Coach'}: ${chatTextForModel(turn.content)}`)
      .join('\n')
    const extracted = await extractPlanChangeProposal({
      clientText: latestClientText,
      transcript,
    })
    if (extracted) {
      const result = await lockAndProcessPlanChangeFromChat({
        clientId: auth.user.id,
        profile,
        pending: extracted,
      })
      await savePendingPlanChange(admin, auth.user.id, null)
      return saveAssistant(result.message)
    }
  }

  const dated = datedPlanRequestDirective(latestClientText)
  const systemPrompt = buildNamedCoachSystemPrompt({
    coachFirstName,
    name: profile.name,
    fitnessGoal: profile.fitness_goal,
    personalities,
    planTitle: thread.planTitle,
    journeySummary: profile.journey_summary,
    nutritionExcerpt: thread.nutritionExcerpt,
    workoutExcerpt: thread.workoutExcerpt,
    dietPreference: thread.dietPreference,
    injuryNote: thread.injuryNote,
    allergyNote: thread.allergyNote,
    purchasedPlanLine: thread.purchasedPlanLine,
    todayPlan: thread.todayPlan,
    trackerLine: thread.trackerLine,
    checkinLine: thread.checkinLine,
    memorySummary: memory.summary,
    moodNote: mood.note,
    languageNote: chatLanguageDirective(replyLanguage),
    mode: 'ai_thread',
  })

  const hasCoachReply = history.some((turn) => turn.role === 'assistant')
  const transcript = [...earlier.slice(-8), ...history]
    .map((turn) => `${turn.role === 'user' ? 'Client' : 'Coach'}: ${chatTextForModel(turn.content)}`)
    .join('\n')
  const replyRequest = coachReplyRequest({
    clientText: latestClientText,
    firstReply: !hasCoachReply,
    mode: 'ai_thread',
  })

  let replyText = 'I am here. Tell me what you need help with on your plan today.'
  try {
    const result = await generateOpenAIResponse({
      systemPrompt,
      userPrompt: [
        transcript || `Client: ${message}`,
        dated ? `\n${dated}` : '',
        '',
        planChangeChatInstruction(quota.remainingToday),
        pendingChange
          ? `There is already a pending plan edit waiting for YES/NO:\nScope: ${pendingChange.scope}\n${pendingChange.requestText}`
          : '',
        '',
        'Write the next coach reply only.',
        replyRequest.instruction,
      ]
        .filter(Boolean)
        .join('\n'),
      model: MODELS.GPT_LUNA,
      maxTokens: replyRequest.maxTokens,
      temperature: 0.55,
    })
    const raw = result.text.replace(/[\u2010-\u2015\u2212-]/g, ' ')
    const stripped = stripPlanChangeTrailer(raw)
    replyText = guardAssistantCoachReply(stripped.visible, { clientText: latestClientText }) || replyText
    if (stripped.propose && !dated) {
      await savePendingPlanChange(admin, auth.user.id, stripped.propose)
      replyText = withConfirmCue(replyText, quota.remainingToday)
    }
  } catch {
    replyText =
      'I could not reply just now. Try again in a moment — or open your plan and stick to today\'s workouts and meals.'
  }

  return saveAssistant(replyText)
}
