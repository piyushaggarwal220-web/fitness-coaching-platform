import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const state = new URL(request.url).searchParams.get('state')
  const admin = createAdminClient()
  let query = admin.from('notification_jobs')
    .select('*, notification_events(event_type,title,body,created_at), notification_attempts(*)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (state && state !== 'all') query = query.eq('state', state)
  const [{ data: jobs, error }, { data: budget }, { data: policies }, { count: deadLetters }, { count: whatsappMonth }] =
    await Promise.all([
      query,
      admin.from('notification_budget_settings').select('*').single(),
      admin.from('notification_channel_policies').select('*').order('event_type'),
      admin.from('notification_jobs').select('id', { count: 'exact', head: true }).eq('state', 'dead_letter'),
      admin.from('notification_jobs').select('id', { count: 'exact', head: true })
        .eq('channel', 'whatsapp').not('sent_at', 'is', null)
        .gte('sent_at', new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()),
    ])
  if (error) return NextResponse.json({ error: 'Could not load notification operations' }, { status: 500 })
  return NextResponse.json({
    jobs: jobs ?? [],
    budget,
    policies: policies ?? [],
    metrics: {
      deadLetters: deadLetters ?? 0,
      deadLetterAlert: (deadLetters ?? 0) >= Number(budget?.dead_letter_alert_threshold ?? 10),
      whatsappSentThisMonth: whatsappMonth ?? 0,
      whatsappEstimatedCostMicros: (whatsappMonth ?? 0) * Number(budget?.whatsapp_estimated_unit_cost_micros ?? 0),
      providerConfiguration: {
        webPush: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT),
        email: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFICATION_FROM_EMAIL),
        whatsapp: Boolean(process.env.AISENSY_API_KEY),
      },
    },
  })
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => null) as {
    jobId?: string
    retry?: boolean
    whatsappEnabled?: boolean
    whatsappMonthlyCap?: number
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const admin = createAdminClient()
  if (body.retry && body.jobId) {
    const { data } = await admin.from('notification_jobs').update({
      state: 'queued',
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      claimed_at: null,
      claim_token: null,
      updated_at: new Date().toISOString(),
    }).eq('id', body.jobId).in('state', ['failed', 'dead_letter', 'cancelled']).select('id').maybeSingle()
    if (!data) return NextResponse.json({ error: 'Job is not retryable' }, { status: 409 })
    await admin.from('notification_attempts').insert({
      job_id: body.jobId,
      attempt_number: 0,
      state: 'queued',
      provider: 'admin',
      metadata: { actorUserId: auth.userId, action: 'manual_retry' },
    })
    return NextResponse.json({ ok: true })
  }
  if (typeof body.whatsappEnabled === 'boolean' || Number.isInteger(body.whatsappMonthlyCap)) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.whatsappEnabled === 'boolean') update.whatsapp_enabled = body.whatsappEnabled
    if (Number.isInteger(body.whatsappMonthlyCap) && body.whatsappMonthlyCap! >= 0) {
      update.whatsapp_monthly_cap = body.whatsappMonthlyCap
    }
    await admin.from('notification_budget_settings').update(update).eq('singleton', true)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'No supported operation' }, { status: 400 })
}
