import 'server-only'
import { sendDirectEmail } from '@/lib/notifications/email-provider'
import { sendDirectWhatsApp } from '@/lib/notifications/whatsapp-provider'
import { sendNotification } from '@/lib/notifications/service'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationType } from '@/types/database'

type DeliveryResult = { sent: number; skipped: number; failed: number }

function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (process.env.VERCEL_URL?.trim()) return `https://${process.env.VERCEL_URL.trim()}`
  return 'http://localhost:3000'
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'there'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return entities[character] ?? character
  })
}

async function reserveDelivery(input: {
  purchaseId?: string
  userId?: string
  kind: string
  channel: 'email' | 'whatsapp' | 'in_app'
  dedupeKey: string
}): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('lifecycle_deliveries')
    .insert({
      purchase_id: input.purchaseId ?? null,
      user_id: input.userId ?? null,
      kind: input.kind,
      channel: input.channel,
      dedupe_key: input.dedupeKey,
      status: 'pending',
      attempt_count: 1,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error?.code === '23505') {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('lifecycle_deliveries')
      .select('id, status, attempt_count')
      .eq('dedupe_key', input.dedupeKey)
      .maybeSingle()
    if (!existing || existing.status !== 'failed') return null
    const { data: retried } = await admin
      .from('lifecycle_deliveries')
      .update({
        status: 'pending',
        attempt_count: (existing.attempt_count ?? 1) + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle()
    return (retried?.id as string | undefined) ?? null
  }
  if (error || !data) throw new Error(error?.message ?? 'Failed to reserve lifecycle delivery')
  return data.id as string
}

async function finishDelivery(
  id: string,
  outcome: { ok: boolean; skipped?: boolean; error?: string }
): Promise<void> {
  const admin = createAdminClient()
  if (outcome.skipped) {
    await admin.from('lifecycle_deliveries').delete().eq('id', id)
    return
  }
  await admin
    .from('lifecycle_deliveries')
    .update({
      status: outcome.ok ? 'sent' : 'failed',
      sent_at: outcome.ok && !outcome.skipped ? new Date().toISOString() : null,
      last_error: outcome.error?.slice(0, 500) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
}

async function deliverOnce(
  input: Parameters<typeof reserveDelivery>[0],
  send: () => Promise<{ ok: boolean; skipped?: boolean; error?: string }>
): Promise<'sent' | 'skipped' | 'failed'> {
  const id = await reserveDelivery(input)
  if (!id) return 'skipped'
  try {
    const outcome = await send()
    await finishDelivery(id, outcome)
    return outcome.skipped ? 'skipped' : outcome.ok ? 'sent' : 'failed'
  } catch (error) {
    await finishDelivery(id, {
      ok: false,
      error: error instanceof Error ? error.message : 'Delivery failed',
    })
    return 'failed'
  }
}

function summarize(results: ('sent' | 'skipped' | 'failed')[]): DeliveryResult {
  return {
    sent: results.filter((result) => result === 'sent').length,
    skipped: results.filter((result) => result === 'skipped').length,
    failed: results.filter((result) => result === 'failed').length,
  }
}

export async function sendAccountSetupRecovery(input: {
  purchaseId: string
  token: string
  email: string
  phone?: string | null
  name?: string | null
  stage: string
}): Promise<DeliveryResult> {
  const setupUrl = `${appBaseUrl()}/create-account?token=${encodeURIComponent(input.token)}`
  const greeting = firstName(input.name)
  const kind = `account_setup_${input.stage}`

  const results = await Promise.all([
    deliverOnce(
      {
        purchaseId: input.purchaseId,
        kind,
        channel: 'email',
        dedupeKey: `${input.purchaseId}:${kind}:email`,
      },
      () =>
        sendDirectEmail({
          to: input.email,
          subject: 'Finish setting up your LURVOX account',
          text: `Hi ${greeting}, your payment is confirmed. Create your account securely: ${setupUrl}. This link expires in 7 days.`,
          html: `<p>Hi ${escapeHtml(greeting)},</p><p>Your payment is confirmed.</p><p><a href="${escapeHtml(setupUrl)}">Finish creating your LURVOX account</a></p><p>This link expires in 7 days.</p>`,
        })
    ),
    deliverOnce(
      {
        purchaseId: input.purchaseId,
        kind,
        channel: 'whatsapp',
        dedupeKey: `${input.purchaseId}:${kind}:whatsapp`,
      },
      () =>
        sendDirectWhatsApp({
          campaignEnv: 'AISENSY_CAMPAIGN_ACCOUNT_SETUP',
          phone: input.phone,
          name: input.name,
          templateParams: [greeting, setupUrl],
        })
    ),
  ])

  return summarize(results)
}

export async function sendOnboardingReminder(input: {
  userId: string
  email: string
  phone?: string | null
  name?: string | null
  stage: string
  photosMissing: boolean
}): Promise<DeliveryResult> {
  const isPhoto = input.photosMissing
  const kind = isPhoto ? `photo_reminder_${input.stage}` : `onboarding_reminder_${input.stage}`
  const actionUrl = '/onboarding'
  const title = isPhoto ? 'Upload your progress photos' : 'Complete your coaching onboarding'
  const body = isPhoto
    ? 'Upload your front, side, and back photos so your coach can personalize your plan.'
    : 'Complete your onboarding so your coach can prepare your personalized plan.'
  const type: NotificationType = isPhoto ? 'photo_reminder' : 'onboarding_reminder'

  const results = await Promise.all([
    deliverOnce(
      {
        userId: input.userId,
        kind,
        channel: 'in_app',
        dedupeKey: `${input.userId}:${kind}:in_app`,
      },
      async () => ({
        ok: Boolean(await sendNotification({
          userId: input.userId,
          type,
          title,
          body,
          actionUrl,
          idempotencyKey: `lifecycle:${input.userId}:${kind}`,
          priority: isPhoto ? 'normal' : 'high',
          metadata: { lifecycleStage: input.stage, photosMissing: isPhoto },
        })),
      })
    ),
  ])

  return summarize(results)
}
