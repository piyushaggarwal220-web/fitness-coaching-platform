import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params
  if (provider !== 'aisensy' && provider !== 'resend') {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 })
  }
  const rawBody = await request.text()
  const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`]?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let payload: Record<string, unknown> | null = null
  if (provider === 'resend') {
    try {
      payload = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
        payload: rawBody,
        headers: {
          id: request.headers.get('svix-id') ?? '',
          timestamp: request.headers.get('svix-timestamp') ?? '',
          signature: request.headers.get('svix-signature') ?? '',
        },
        webhookSecret: secret,
      }) as unknown as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    if (!safeEqual(secret, supplied)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
  }
  const nested = payload?.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : null
  const providerMessageId = String(
    payload?.messageId ?? nested?.email_id ?? payload?.email_id ?? payload?.id ?? ''
  ).trim()
  const rawStatus = String(payload?.status ?? payload?.type ?? '').toLowerCase()
  if (!providerMessageId || !rawStatus) {
    return NextResponse.json({ error: 'Provider message ID and status required' }, { status: 400 })
  }
  const state = rawStatus.includes('deliver')
    ? 'delivered'
    : rawStatus.includes('read') || rawStatus.includes('open')
      ? 'delivered'
      : rawStatus.includes('fail') || rawStatus.includes('bounce')
        ? 'failed'
        : rawStatus.includes('sent')
          ? 'sent'
          : null
  if (!state) return NextResponse.json({ ok: true, ignored: true })

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: job } = await admin.from('notification_jobs').update({
    state,
    delivered_at: state === 'delivered' ? now : null,
    last_error: state === 'failed' ? rawStatus.slice(0, 500) : null,
    updated_at: now,
  }).eq('provider_message_id', providerMessageId).select('id, attempt_count').maybeSingle()
  if (job) {
    await admin.from('notification_attempts').insert({
      job_id: job.id,
      attempt_number: job.attempt_count,
      state,
      provider,
      provider_message_id: providerMessageId,
      metadata: { receipt: rawStatus },
    })
  }
  return NextResponse.json({ ok: true, matched: Boolean(job) })
}
