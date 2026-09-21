import { after, NextResponse } from 'next/server'
import { persistDraftGenerationStarted } from '@/lib/ai/draft-workflow-log'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import { generateWeeklyPlanDraft } from '@/lib/ai/weekly-plan-draft'
import { hasClientEntitlement } from '@/lib/entitlements'
import { sendNotification } from '@/lib/notifications/service'
import { activatePlan } from '@/lib/plans'
import { coachRequiresManualPlanDelivery } from '@/lib/coach-delivery-policy'
import { fetchCapturedPlanSlug, shouldAutoGenerateWeeklyPlanDraft } from '@/lib/plan-update-cadence'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** How far back the scheduled batch looks for missed weekly plan updates. */
const BATCH_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000
const BATCH_LIMIT = 5

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
  if (coachRequiresManualPlanDelivery(checkin.coach_id)) {
    return { checkinId, name, status: 'SKIP' as const, error: 'manual_plan_delivery' }
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

async function statusOneCheckin(checkinId: string) {
  const admin = createAdminClient()
  const { data: checkin, error } = await admin
    .from('checkins')
    .select('id, client_id, submitted_at')
    .eq('id', checkinId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!checkin) return { checkinId, status: 'FAIL' as const, error: 'checkin not found' }

  const { data: profile } = await admin.from('profiles').select('name').eq('id', checkin.client_id).maybeSingle()
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
    return {
      checkinId,
      name: profile?.name ?? checkin.client_id,
      status: 'SENT' as const,
      planId: active.id,
    }
  }
  return { checkinId, name: profile?.name ?? checkin.client_id, status: 'PENDING' as const }
}

type MissedCheckin = {
  id: string
  client_id: string
  coach_id: string
  coaching_week: number
  submitted_at: string
}

/** Discover weekly check-ins that still need a post-check-in plan delivery. */
async function discoverMissedWeeklyCheckins(limit: number): Promise<MissedCheckin[]> {
  const admin = createAdminClient()
  const since = new Date(Date.now() - BATCH_LOOKBACK_MS).toISOString()

  const { data: checkins, error } = await admin
    .from('checkins')
    .select('id, client_id, coach_id, coaching_week, submitted_at')
    .eq('checkin_type', 'weekly')
    .gte('submitted_at', since)
    .order('submitted_at', { ascending: true })
    .limit(80)

  if (error) throw new Error(error.message)

  const queued: MissedCheckin[] = []

  for (const checkin of (checkins ?? []) as MissedCheckin[]) {
    if (queued.length >= limit) break
    if (coachRequiresManualPlanDelivery(checkin.coach_id)) continue

    const { data: profile } = await admin
      .from('profiles')
      .select('id, name, email, payment_confirmed, access_source, subscription_expires_at')
      .eq('id', checkin.client_id)
      .maybeSingle()

    if (profile?.email?.includes('@lurvox.test')) continue
    if (!hasClientEntitlement(profile)) continue

    const planSlug = await fetchCapturedPlanSlug(checkin.client_id)
    if (!shouldAutoGenerateWeeklyPlanDraft(planSlug, checkin.coaching_week)) continue

    const { data: active } = await admin
      .from('plans')
      .select('id, delivered_at')
      .eq('client_id', checkin.client_id)
      .eq('active', true)
      .maybeSingle()

    const alreadyUpdated =
      active?.delivered_at &&
      new Date(active.delivered_at).getTime() >= new Date(checkin.submitted_at).getTime()
    if (alreadyUpdated) continue

    queued.push(checkin)
  }

  return queued
}

async function runBatch(limit: number) {
  const missed = await discoverMissedWeeklyCheckins(limit)
  for (const row of missed) {
    await persistDraftGenerationStarted({
      clientId: row.client_id,
      coachId: row.coach_id,
      checkinId: row.id,
      trigger: 'retry',
    }).catch((err) =>
      console.error('[cron/send-missed-weekly-plans] draft start log failed:', err)
    )

    const checkinId = row.id
    after(() =>
      sendOneCheckin(checkinId).catch((err) => {
        console.error(
          '[cron/send-missed-weekly-plans] background send failed:',
          err instanceof Error ? err.message : err
        )
      })
    )
  }
  return {
    ok: true,
    mode: 'batch' as const,
    queued: missed.length,
    checkinIds: missed.map((row) => row.id),
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const ping = url.searchParams.get('ping')
  if (ping === '1') {
    try {
      const result = await pingOpenAI()
      return NextResponse.json({ provider: 'openai', ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OpenAI ping failed'
      return NextResponse.json({ provider: 'openai', ok: false, error: message }, { status: 502 })
    }
  }

  const checkinId = url.searchParams.get('checkinId')?.trim()
  if (checkinId) {
    const result = await statusOneCheckin(checkinId)
    return NextResponse.json(result)
  }

  // Scheduled cron / ops: discover and queue a small batch of missed weekly plans.
  const limit = Math.min(
    10,
    Math.max(1, Number(url.searchParams.get('limit') ?? String(BATCH_LIMIT)) || BATCH_LIMIT)
  )
  try {
    const result = await runBatch(limit)
    return NextResponse.json(result, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'batch failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { checkinId?: string; ping?: boolean; batch?: boolean; limit?: number } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = {}
  }

  const url = new URL(request.url)
  const ping = body.ping || url.searchParams.get('ping') === '1'
  if (ping) {
    try {
      const result = await pingOpenAI()
      return NextResponse.json({ provider: 'openai', ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OpenAI ping failed'
      return NextResponse.json({ provider: 'openai', ok: false, error: message }, { status: 502 })
    }
  }

  const wantBatch =
    body.batch === true ||
    url.searchParams.get('batch') === '1' ||
    (!body.checkinId?.trim() && !url.searchParams.get('checkinId')?.trim())

  if (wantBatch && !body.checkinId?.trim() && !url.searchParams.get('checkinId')?.trim()) {
    const limit = Math.min(
      10,
      Math.max(
        1,
        Number(body.limit ?? url.searchParams.get('limit') ?? String(BATCH_LIMIT)) || BATCH_LIMIT
      )
    )
    try {
      const result = await runBatch(limit)
      return NextResponse.json(result, { status: 202 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'batch failed'
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
  }

  const checkinId = body.checkinId?.trim() || url.searchParams.get('checkinId')?.trim() || ''
  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId is required' }, { status: 400 })
  }

  try {
    const preview = await statusOneCheckin(checkinId)
    if (preview.status === 'SENT') {
      return NextResponse.json({ ...preview, error: 'already updated' })
    }

    const admin = createAdminClient()
    const { data: checkin } = await admin
      .from('checkins')
      .select('client_id, coach_id, coaching_week')
      .eq('id', checkinId)
      .maybeSingle()
    if (checkin) {
      await persistDraftGenerationStarted({
        clientId: checkin.client_id,
        coachId: checkin.coach_id,
        checkinId,
        trigger: 'retry',
      })
    }

    after(() =>
      sendOneCheckin(checkinId).catch((err) => {
        console.error(
          '[cron/send-missed-weekly-plans] background send failed:',
          err instanceof Error ? err.message : err
        )
      })
    )

    return NextResponse.json({ checkinId, status: 'QUEUED', error: null }, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed'
    return NextResponse.json({ checkinId, status: 'FAIL', error: message }, { status: 500 })
  }
}
