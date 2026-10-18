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
  COACH_COMPACT_MAX_TURNS,
  COACH_LIVE_TURNS,
  readClientMood,
  selectTurnsToCompact,
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
import { chatTextForModel, decodeChatPhoto, decodeChatVoice, encodeChatVoice } from '@/lib/chat-reply-pause'
import {
  applyProfileChangeFromChat,
  describeProfileChange,
  extractProfileChangeFromText,
  loadPendingProfileChange,
  profileChangeChatInstruction,
  savePendingProfileChange,
  stripProfileChangeTrailer,
  withProfileConfirmCue,
  type ProfileChangeProposal,
} from '@/lib/ai/ai-coach-profile-change'
import { memberFacingCoachFirstName } from '@/lib/coach-delivery-policy'
import {
  AI_COACH_VISIBLE_MESSAGES,
  chronologicalChatWindow,
} from '@/lib/ai/ai-coach-history'
import { assertInstantFeatureAccess } from '@/lib/instant-feature-guard'
import { getPlanChangeQuota } from '@/lib/plan-change-requests'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 120

type ChatTurn = { role: 'user' | 'assistant'; content: string }

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
): Promise<{ summary: string; replyLanguage: ChatLanguage; summarizedThrough: string | null }> {
  const { data, error } = await admin
    .from('ai_coach_memory')
    .select('summary, reply_language, summarized_through')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !data) return { summary: '', replyLanguage: 'hinglish', summarizedThrough: null }
  return {
    summary: data.summary?.trim() ?? '',
    replyLanguage: parseChatLanguage(data.reply_language) ?? 'hinglish',
    summarizedThrough: data.summarized_through ?? null,
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

async function compactCoachProceedings(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  input: { previous: string; summarizedThrough: string | null; mood: string }
): Promise<void> {
  const { data: liveRows, error: liveError } = await admin
    .from('ai_coach_messages')
    .select('created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(COACH_LIVE_TURNS)
  if (liveError || !liveRows || liveRows.length < COACH_LIVE_TURNS) return

  const liveCutoff = liveRows[liveRows.length - 1]?.created_at
  if (!liveCutoff) return

  let previous = input.previous
  let summarizedThrough = input.summarizedThrough
  // A long backlog folds forward a chunk at a time. Stop once the gap is small.
  for (let pass = 0; pass < 6; pass += 1) {
    let pendingQuery = admin
      .from('ai_coach_messages')
      .select('role, content, created_at')
      .eq('client_id', clientId)
      .lt('created_at', liveCutoff)
      .order('created_at', { ascending: true })
      .limit(COACH_COMPACT_MAX_TURNS)
    if (summarizedThrough) pendingQuery = pendingQuery.gt('created_at', summarizedThrough)

    const { data: pendingRows, error: pendingError } = await pendingQuery
    if (pendingError || !pendingRows?.length) return

    const turns = selectTurnsToCompact(pendingRows)
    if (turns.length === 0) return
    const through = turns[turns.length - 1]?.created_at
    if (!through) return

    const older = turns
      .map((row) => `${row.role === 'user' ? 'Client' : 'Coach'}: ${chatTextForModel(row.content)}`)
      .join('\n')
      .slice(0, 12000)
    const prompt = buildCoachMemoryUpdatePrompt({ previous, turns: older })
    const result = await generateOpenAIResponse({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      model: MODELS.GPT_LUNA,
      maxTokens: 900,
      temperature: 0.2,
    })
    const summary = clipCoachMemory(result.text)
    if (!summary) return
    const { error: saveError } = await admin.from('ai_coach_memory').upsert({
      client_id: clientId,
      summary,
      mood: input.mood,
      summarized_through: through,
      updated_at: new Date().toISOString(),
    })
    if (saveError) return
    previous = summary
    summarizedThrough = through
  }
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
  const [{ data: rows, error: historyError }, earlier, coachFirstName] = await Promise.all([
    admin
      .from('ai_coach_messages')
      .select('id, role, content, created_at')
      .eq('client_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(AI_COACH_VISIBLE_MESSAGES),
    earlierCoachThread(admin, auth.user.id),
    coachNameForClient(admin, profile),
  ])

  if (historyError) {
    return NextResponse.json({ error: 'Could not load chat' }, { status: 500 })
  }

  const messages = [
    ...earlier.map((turn, index) => ({
      id: `earlier-${index}`,
      role: turn.role,
      content: turn.content,
      created_at: null,
    })),
    ...chronologicalChatWindow(rows ?? []),
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
    .limit(COACH_LIVE_TURNS)

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
  const pendingProfile = await loadPendingProfileChange(admin, auth.user.id)
  const quota = await getPlanChangeQuota(auth.user.id)
  const ownPhotoPath = (raw: string | null | undefined): string | null => {
    if (!raw) return null
    const path = decodeChatPhoto(raw).imagePath
    return path && ownVoicePath(path, auth.user.id) ? path : null
  }
  const latestPhotoPath = (): string | null => {
    const current = ownPhotoPath(storedMessage)
    if (current) return current
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i]?.role !== 'user') continue
      const path = ownPhotoPath(history[i]?.content)
      if (path) return path
    }
    return null
  }
  const withPhoto = (proposal: ProfileChangeProposal): ProfileChangeProposal => {
    if (!proposal.photoSlot) return { ...proposal, photoPath: null }
    return { ...proposal, photoPath: latestPhotoPath() }
  }

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
      await compactCoachProceedings(admin, auth.user.id, {
        previous: memory.summary,
        summarizedThrough: memory.summarizedThrough,
        mood: mood.mood,
      })
    } catch {
      // Reply already saved. The next reply compacts this gap.
    }
    return NextResponse.json({ message: assistantRow, coachFirstName })
  }

  if ((pendingProfile || pendingChange) && isPlanChangeCancel(latestClientText)) {
    if (pendingProfile) await savePendingProfileChange(admin, auth.user.id, null)
    if (pendingChange) await savePendingPlanChange(admin, auth.user.id, null)
    return saveAssistant('Okay — I left your profile and your written plan as they are.')
  }

  if (pendingProfile && isPlanChangeConfirm(latestClientText)) {
    const result = await applyProfileChangeFromChat({
      clientId: auth.user.id,
      pending: withPhoto(pendingProfile),
    })
    if (result.ok) await savePendingProfileChange(admin, auth.user.id, null)
    const planStillWaiting =
      result.ok && pendingChange
        ? '\n\nThe written plan edit is still waiting. Reply YES again if you want that locked into My Plan.'
        : ''
    return saveAssistant(`${result.message}${planStillWaiting}`)
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
    situationLine: thread.situationLine,
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
        profileChangeChatInstruction(),
        pendingChange
          ? `There is already a pending plan edit waiting for YES/NO:\nScope: ${pendingChange.scope}\n${pendingChange.requestText}`
          : '',
        pendingProfile
          ? `There is already a pending profile update waiting for YES/NO:\n${pendingProfile.summary}`
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
    const profileStripped = stripProfileChangeTrailer(raw)
    const stripped = stripPlanChangeTrailer(profileStripped.visible)
    replyText = guardAssistantCoachReply(stripped.visible, { clientText: latestClientText }) || replyText
    const fromText = extractProfileChangeFromText(latestClientText, latestPhotoPath())
    const profileProposal = profileStripped.propose
      ? withPhoto(profileStripped.propose)
      : fromText
    if (profileProposal) {
      if (isPlanChangeConfirm(latestClientText)) {
        const applied = await applyProfileChangeFromChat({
          clientId: auth.user.id,
          pending: profileProposal,
        })
        if (applied.ok) {
          await savePendingProfileChange(admin, auth.user.id, null)
          replyText = applied.message
        } else {
          await savePendingProfileChange(admin, auth.user.id, profileProposal)
          replyText = applied.message
        }
      } else {
        await savePendingProfileChange(admin, auth.user.id, profileProposal)
        if (!profileStripped.propose) {
          replyText = `I can save this on your profile: ${describeProfileChange(profileProposal)}.`
        }
        replyText = withProfileConfirmCue(replyText)
      }
    }
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
