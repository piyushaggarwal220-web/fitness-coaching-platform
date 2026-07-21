import 'server-only'
import { randomUUID } from 'node:crypto'
import webpush from 'web-push'
import { sendDirectEmail } from '@/lib/notifications/email-provider'
import { sendNotificationWhatsApp } from '@/lib/notifications/whatsapp-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationPayload, NotificationChannel } from '@/lib/notifications/service'
import type { NotificationType } from '@/types/database'

type JobState = 'queued' | 'claimed' | 'sent' | 'delivered' | 'failed' | 'cancelled' | 'dead_letter'
type ClaimedJob = {
  id: string
  event_id: string
  user_id: string
  channel: NotificationChannel
  attempt_count: number
  max_attempts: number
}

type EventRow = {
  event_type: NotificationType
  title: string
  body: string
  action_url: string | null
  metadata: Record<string, unknown>
  priority: NotificationPayload['priority']
}

type DeliveryOutcome = {
  ok: boolean
  skipped?: boolean
  error?: string
  providerMessageId?: string
  delivered?: boolean
}

export function retryDelayMs(attempt: number, seed: string): number {
  const base = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1))
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return base + Math.floor(base * 0.25 * (hash / 0xffffffff))
}

export function isWithinQuietHours(
  start: string | null | undefined,
  end: string | null | undefined,
  timezone: string,
  now = new Date()
): boolean {
  if (!start || !end || start === end) return false
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const current = Number(parts.find((part) => part.type === 'hour')?.value) * 60
    + Number(parts.find((part) => part.type === 'minute')?.value)
  const minutes = (value: string) => {
    const [hour = '0', minute = '0'] = value.split(':')
    return Number(hour) * 60 + Number(minute)
  }
  const from = minutes(start)
  const until = minutes(end)
  return from < until ? current >= from && current < until : current >= from || current < until
}

function configureWebPush(): boolean {
  const subject = process.env.VAPID_SUBJECT?.trim()
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!subject || !publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

async function deliverPush(job: ClaimedJob, event: EventRow): Promise<DeliveryOutcome> {
  if (!configureWebPush()) return { ok: true, skipped: true, error: 'VAPID is not configured' }
  const admin = createAdminClient()
  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', job.user_id)
    .is('disabled_at', null)
  if (!subscriptions?.length) return { ok: true, skipped: true, error: 'No active push subscription' }

  let sent = 0
  const errors: string[] = []
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        notificationId: job.event_id,
        title: event.title,
        body: event.body,
        actionUrl: event.action_url,
        tag: `notification-${event.event_type}`,
      }), { TTL: 86_400, urgency: event.priority === 'critical' ? 'high' : 'normal' })
      sent += 1
      await admin.from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), last_error: null })
        .eq('id', subscription.id)
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      const message = error instanceof Error ? error.message : 'Push failed'
      errors.push(message)
      await admin.from('push_subscriptions').update({
        disabled_at: statusCode === 404 || statusCode === 410 ? new Date().toISOString() : null,
        last_error: message.slice(0, 500),
      }).eq('id', subscription.id)
    }
  }
  return sent > 0 ? { ok: true, delivered: true } : { ok: false, error: errors.join('; ') }
}

async function deliver(job: ClaimedJob, event: EventRow): Promise<DeliveryOutcome> {
  const admin = createAdminClient()
  const { data: preference } = await admin.from('notification_preferences')
    .select('*').eq('user_id', job.user_id).maybeSingle()
  const channelEnabled = job.channel === 'web_push'
    ? preference?.web_push_enabled !== false
    : job.channel === 'email'
      ? preference?.email_enabled === true
      : job.channel === 'whatsapp'
        ? preference?.whatsapp_enabled !== false
        : true
  if (!channelEnabled) return { ok: true, skipped: true, error: 'Disabled by recipient preference' }

  if (
    job.channel !== 'in_app'
    && isWithinQuietHours(
      preference?.quiet_hours_start,
      preference?.quiet_hours_end,
      preference?.timezone ?? 'Asia/Kolkata'
    )
    && event.priority !== 'critical'
  ) {
    return { ok: false, error: 'quiet_hours' }
  }

  const payload: NotificationPayload = {
    userId: job.user_id,
    type: event.event_type,
    title: event.title,
    body: event.body,
    actionUrl: event.action_url ?? undefined,
    metadata: event.metadata,
    priority: event.priority,
  }

  if (job.channel === 'web_push') return deliverPush(job, event)
  if (job.channel === 'whatsapp') {
    const { data: cap } = await admin.rpc('can_send_whatsapp', { p_job_id: job.id })
    const decision = Array.isArray(cap) ? cap[0] : cap
    if (!decision?.allowed) return { ok: true, skipped: true, error: decision?.reason ?? 'WhatsApp cap' }
    return sendNotificationWhatsApp(payload)
  }
  if (job.channel === 'email') {
    const { data: profile } = await admin.from('profiles').select('email').eq('id', job.user_id).maybeSingle()
    if (!profile?.email) return { ok: true, skipped: true, error: 'Recipient has no email' }
    return sendDirectEmail({
      to: profile.email,
      subject: event.title,
      text: `${event.body}${event.action_url ? `\n\n${event.action_url}` : ''}`,
    })
  }
  return { ok: true, delivered: true }
}

async function finishJob(job: ClaimedJob, outcome: DeliveryOutcome, durationMs: number): Promise<void> {
  const admin = createAdminClient()
  const now = new Date()
  let state: JobState
  let nextAttemptAt: string | null = null
  if (outcome.skipped) state = 'cancelled'
  else if (outcome.ok) state = outcome.delivered ? 'delivered' : 'sent'
  else if (job.attempt_count >= job.max_attempts) state = 'dead_letter'
  else {
    state = 'failed'
    const delay = outcome.error === 'quiet_hours'
      ? 60 * 60_000
      : retryDelayMs(job.attempt_count, job.id)
    nextAttemptAt = new Date(now.getTime() + delay).toISOString()
  }

  await admin.from('notification_jobs').update({
    state,
    next_attempt_at: nextAttemptAt ?? now.toISOString(),
    provider_message_id: outcome.providerMessageId ?? null,
    sent_at: outcome.ok && !outcome.skipped ? now.toISOString() : null,
    delivered_at: outcome.delivered ? now.toISOString() : null,
    last_error: outcome.error?.slice(0, 1000) ?? null,
    claim_token: null,
    claimed_at: null,
    updated_at: now.toISOString(),
  }).eq('id', job.id)
  await admin.from('notification_attempts').insert({
    job_id: job.id,
    attempt_number: job.attempt_count,
    state,
    provider: job.channel === 'web_push' ? 'web-push' : job.channel === 'whatsapp' ? 'aisensy' : job.channel,
    provider_message_id: outcome.providerMessageId ?? null,
    error: outcome.error?.slice(0, 1000) ?? null,
    duration_ms: durationMs,
  })
}

export async function processNotificationJobs(limit = 50): Promise<Record<string, number>> {
  const admin = createAdminClient()
  const workerId = randomUUID()
  const { data, error } = await admin.rpc('claim_notification_jobs', {
    p_limit: Math.min(Math.max(limit, 1), 100),
    p_worker: workerId,
  })
  if (error) throw new Error(`Could not claim notification jobs: ${error.message}`)
  const jobs = (data ?? []) as ClaimedJob[]
  const counts: Record<string, number> = { claimed: jobs.length, sent: 0, failed: 0, cancelled: 0 }

  for (const job of jobs) {
    const started = Date.now()
    const { data: event } = await admin.from('notification_events').select('*').eq('id', job.event_id).single()
    if (!event) {
      await finishJob(job, { ok: false, error: 'Notification event missing' }, Date.now() - started)
      counts.failed += 1
      continue
    }
    try {
      const outcome = await deliver(job, event as EventRow)
      await finishJob(job, outcome, Date.now() - started)
      counts[outcome.skipped ? 'cancelled' : outcome.ok ? 'sent' : 'failed'] += 1
    } catch (error) {
      await finishJob(job, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unhandled delivery error',
      }, Date.now() - started)
      counts.failed += 1
    }
  }
  return counts
}
