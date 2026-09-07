import { NextResponse } from 'next/server'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import { generateWeeklyPlanDraft } from '@/lib/ai/weekly-plan-draft'
import { hasClientEntitlement } from '@/lib/entitlements'
import { sendNotification } from '@/lib/notifications/service'
import { activatePlan } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorize(request: Request): boolean {
  const secrets = [
    process.env.CRON_SECRET,
    process.env.AUTO_REPLY_CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      return false
    }
    return true
  }

  const header = request.headers.get('authorization')
  const query = new URL(request.url).searchParams.get('secret')
  return secrets.some((secret) => header === `Bearer ${secret}` || query === secret)
}

async function pingOpenAI() {
  const result = await generateOpenAIResponse({
    systemPrompt: 'Reply with the single word pong.',
    userPrompt: 'ping',
    model: MODELS.GPT_LUNA,
    maxTokens: 32,
    temperature: 0,
  })
  const text = result.text.trim().toLowerCase()
  return {
    ok: text.includes('pong') || text.length > 0,
    model: result.model,
    textLen: result.text.trim().length,
  }
}

async function sendOneCheckin(checkinId: string) {
  const admin = createAdminClient()
  const { data: checkin, error } = await admin
    .from('checkins')
    .select('id, client_id, coach_id, coaching_week, submitted_at')
    .eq('id', checkinId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!checkin) return { checkinId, status: 'FAIL' as const, error: 'checkin not found' }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, name, email, payment_confirmed, access_source, subscription_expires_at')
    .eq('id', checkin.client_id)
    .maybeSingle()

  const name = profile?.name ?? checkin.client_id
  if (profile?.email?.includes('@lurvox.test')) {
    return { checkinId, name, status: 'SKIP' as const, error: 'trial' }
  }
  if (!hasClientEntitlement(profile)) {
    return { checkinId, name, status: 'SKIP' as const, error: 'no entitlement' }
  }

  const { data: active } = await admin
    .from('plans')
    .select('id, delivered_at')
    .eq('client_id', checkin.client_id)
    .eq('active', true)
    .maybeSingle()

  if (
    active?.delivered_at &&
    new Date(active.delivered_at).getTime() >= new Date(checkin.submitted_at).getTime()
  ) {
    return { checkinId, name, status: 'SKIP' as const, error: 'already updated', planId: active.id }
  }

  const result = await generateWeeklyPlanDraft({
    clientId: checkin.client_id,
    coachId: checkin.coach_id,
    checkinId: checkin.id,
    coachingWeek: checkin.coaching_week,
    trigger: 'retry',
  })

  if (result.error || !result.planId) {
    return { checkinId, name, status: 'FAIL' as const, error: result.error ?? 'no planId' }
  }

  const published = await activatePlan(
    admin,
    {
      id: result.planId,
      client_id: checkin.client_id,
      coach_id: checkin.coach_id,
    },
    { skipReplyWait: true }
  )
  if (published.error) {
    return { checkinId, name, status: 'FAIL' as const, error: published.error, planId: result.planId }
  }

  await sendNotification({
    userId: checkin.client_id,
    type: 'plan_delivered',
    title: 'Your updated plan is ready',
    body: 'Your coach published this week’s diet and workout. Open Plan or Tracker to follow it.',
    actionUrl: '/plan',
    metadata: { checkinId: checkin.id, planId: result.planId, backfill: true },
    idempotencyKey: `missed-weekly-plan:${checkin.id}`,
  })

  return {
    checkinId,
    name,
    status: 'SENT' as const,
    planId: result.planId,
    generationTimeMs: result.generationTimeMs,
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ping = new URL(request.url).searchParams.get('ping')
  if (ping === '1') {
    try {
      const result = await pingOpenAI()
      return NextResponse.json({ provider: 'openai', ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OpenAI ping failed'
      return NextResponse.json({ provider: 'openai', ok: false, error: message }, { status: 502 })
    }
  }
  return NextResponse.json({ error: 'POST checkinId or GET ?ping=1' }, { status: 400 })
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { checkinId?: string; ping?: boolean } = {}
  try {
    body = (await request.json()) as { checkinId?: string; ping?: boolean }
  } catch {
    body = {}
  }

  const ping = body.ping || new URL(request.url).searchParams.get('ping') === '1'
  if (ping) {
    try {
      const result = await pingOpenAI()
      return NextResponse.json({ provider: 'openai', ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OpenAI ping failed'
      return NextResponse.json({ provider: 'openai', ok: false, error: message }, { status: 502 })
    }
  }

  const checkinId =
    body.checkinId?.trim() || new URL(request.url).searchParams.get('checkinId')?.trim() || ''
  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId is required' }, { status: 400 })
  }

  try {
    const result = await sendOneCheckin(checkinId)
    const ok = result.status !== 'FAIL'
    return NextResponse.json(result, { status: ok ? 200 : 502 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed'
    return NextResponse.json({ checkinId, status: 'FAIL', error: message }, { status: 500 })
  }
}
