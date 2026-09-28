import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import { loadAiCoachThreadContext } from '@/lib/ai/ai-coach-context'
import { buildNamedCoachSystemPrompt } from '@/lib/ai/coach-chat-persona'
import { memberFacingCoachFirstName } from '@/lib/coach-delivery-policy'
import { assertInstantFeatureAccess } from '@/lib/instant-feature-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 45

type ChatTurn = { role: 'user' | 'assistant'; content: string }

const MAX_HISTORY = 12
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

  return NextResponse.json({
    messages,
    coachFirstName,
    coachId: profile.coach_id,
  })
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  let body: { message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = (body.message || '').trim()
  if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select(
      'id, name, fitness_goal, diet_preference, injuries, checkin_schedule_started_at, checkin_overdue, coach_service, coach_id, journey_summary, onboarding_data, instant_gates_enabled, addon_ai_chat_entitled, access_source, payment_confirmed'
    )
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json({ error: 'Membership required' }, { status: 403 })
  }

  const denied = await assertInstantFeatureAccess(auth.user.id, profile, 'ai_chat')
  if (denied) return denied

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const [coachFirstName, earlier] = await Promise.all([
    coachNameForClient(admin, profile),
    earlierCoachThread(admin, auth.user.id),
  ])

  const { error: userInsertError } = await admin.from('ai_coach_messages').insert({
    client_id: auth.user.id,
    role: 'user',
    content: message,
    created_at: now,
  })
  if (userInsertError) {
    return NextResponse.json(
      { error: userInsertError.message || 'Could not save message' },
      { status: 500 }
    )
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
    mode: 'ai_thread',
  })

  const transcript = [...earlier.slice(-8), ...history]
    .map((turn) => `${turn.role === 'user' ? 'Client' : 'Coach'}: ${turn.content}`)
    .join('\n')

  let replyText = 'I am here. Tell me what you need help with on your plan today.'
  try {
    const result = await generateOpenAIResponse({
      systemPrompt,
      userPrompt: [
        transcript || `Client: ${message}`,
        '',
        'Write the next coach reply only: 1–2 short lines max (~40 words). No quotes. No hyphen characters. No bullet lists.',
      ].join('\n'),
      model: MODELS.GPT_LUNA,
      maxTokens: 95,
      temperature: 0.6,
    })
    replyText =
      result.text.replace(/[\u2010-\u2015\u2212-]/g, ' ').replace(/\s{2,}/g, ' ').trim() ||
      replyText
  } catch {
    replyText =
      'I could not reply just now. Try again in a moment — or open your plan and stick to today\'s workouts and meals.'
  }

  const { data: assistantRow, error: assistantError } = await admin
    .from('ai_coach_messages')
    .insert({
      client_id: auth.user.id,
      role: 'assistant',
      content: replyText,
      created_at: new Date().toISOString(),
    })
    .select('id, role, content, created_at')
    .single()

  if (assistantError) {
    return NextResponse.json({ error: assistantError.message }, { status: 500 })
  }

  return NextResponse.json({ message: assistantRow, coachFirstName })
}
