import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import { formatCoachPersonalityDirective } from '@/lib/coach-personality'
import { usesAiCoach } from '@/lib/coach-service'
import { assertInstantFeatureAccess } from '@/lib/instant-feature-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 45

type ChatTurn = { role: 'user' | 'assistant'; content: string }

const MAX_HISTORY = 12
const MAX_MESSAGE_LEN = 1200

function buildSystemPrompt(input: {
  name: string | null
  fitnessGoal: string | null
  personalities: string[] | null
  planTitle: string | null
  journeySummary: string | null
}): string {
  return [
    'You are the client\'s Lurvox AI coach inside the app.',
    'You help with their customised diet/workout plan, adherence, and motivation.',
    'Do not claim to be a doctor. No medical advice. No inventing discounts or prices.',
    'Keep replies short (2–5 sentences) unless they ask for detail. India-friendly English.',
    formatCoachPersonalityDirective(input.personalities),
    `Client name: ${input.name || 'Member'}`,
    `Primary goal: ${input.fitnessGoal || 'not set'}`,
    input.planTitle ? `Active plan: ${input.planTitle}` : 'Active plan: not delivered yet — focus on onboarding / habits.',
    input.journeySummary ? `Journey note: ${input.journeySummary}` : '',
  ]
    .filter(Boolean)
    .join('\n')
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
  if (!usesAiCoach(profile)) {
    return NextResponse.json({ error: 'Your chat uses your assigned coach.' }, { status: 400 })
  }

  const denied = await assertInstantFeatureAccess(auth.user.id, profile, 'ai_chat')
  if (denied) return denied

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('ai_coach_messages')
    .select('id, role, content, created_at')
    .eq('client_id', auth.user.id)
    .order('created_at', { ascending: true })
    .limit(80)

  return NextResponse.json({ messages: rows ?? [] })
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
      'id, name, fitness_goal, coach_service, coach_id, journey_summary, onboarding_data, instant_gates_enabled, addon_ai_chat_entitled, access_source, payment_confirmed'
    )
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile?.payment_confirmed) {
    return NextResponse.json({ error: 'Membership required' }, { status: 403 })
  }
  if (!usesAiCoach(profile)) {
    return NextResponse.json({ error: 'Your chat uses your assigned coach.' }, { status: 400 })
  }

  const denied = await assertInstantFeatureAccess(auth.user.id, profile, 'ai_chat')
  if (denied) return denied

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { error: userInsertError } = await admin.from('ai_coach_messages').insert({
    client_id: auth.user.id,
    role: 'user',
    content: message,
    created_at: now,
  })
  if (userInsertError) {
    // Table may not exist yet in local envs without migration — surface clearly.
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

  const { data: plan } = await admin
    .from('plans')
    .select('title')
    .eq('client_id', auth.user.id)
    .eq('active', true)
    .maybeSingle()

  const personalities =
    (profile.onboarding_data as { goals?: { coachPersonalities?: string[] } } | null)?.goals
      ?.coachPersonalities ?? null

  const systemPrompt = buildSystemPrompt({
    name: profile.name,
    fitnessGoal: profile.fitness_goal,
    personalities,
    planTitle: plan?.title ?? null,
    journeySummary: profile.journey_summary,
  })

  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'Client' : 'Coach'}: ${turn.content}`)
    .join('\n')

  let replyText = 'I am here. Tell me what you need help with on your plan today.'
  try {
    const result = await generateOpenAIResponse({
      systemPrompt,
      userPrompt: transcript || `Client: ${message}`,
      model: MODELS.GPT_LUNA,
      maxTokens: 400,
      temperature: 0.6,
    })
    replyText = result.text.trim() || replyText
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

  return NextResponse.json({ message: assistantRow })
}
