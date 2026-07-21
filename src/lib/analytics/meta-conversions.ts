import 'server-only'
import { createHash } from 'crypto'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'

export type MetaPurchaseInput = {
  purchaseId: string
  paymentId: string
  email: string
  phone?: string | null
  amountPaise: number
  currency: string
  planSlug: string
  eventTime?: number
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function metaPurchaseEventId(paymentId: string): string {
  return `razorpay_${paymentId}`
}

export async function sendMetaPurchase(
  input: MetaPurchaseInput
): Promise<{ ok: boolean; skipped?: boolean; eventId: string; error?: string }> {
  const eventId = metaPurchaseEventId(input.paymentId)
  const pixelId = process.env.META_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim()
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN?.trim()
  const apiVersion = process.env.META_CONVERSIONS_API_VERSION?.trim() || 'v22.0'
  const admin = createAdminClient()

  const { data: purchase } = await admin
    .from('purchases')
    .select('meta_purchase_status')
    .eq('id', input.purchaseId)
    .maybeSingle()

  if (purchase?.meta_purchase_status === 'sent') {
    return { ok: true, skipped: true, eventId }
  }

  if (!pixelId || !accessToken) {
    await admin
      .from('purchases')
      .update({ meta_purchase_status: 'skipped_no_config', meta_purchase_error: null })
      .eq('id', input.purchaseId)
    console.info('[meta-capi] Purchase skipped: server credentials are not configured')
    return { ok: true, skipped: true, eventId }
  }

  const userData: Record<string, string[]> = {
    em: [sha256(normalizedEmail(input.email))],
  }
  const phone = normalizePhoneForWhatsApp(input.phone)
  if (phone) userData.ph = [sha256(phone.replace(/\D/g, ''))]

  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${pixelId}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            event_name: 'Purchase',
            event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
            event_id: eventId,
            action_source: 'website',
            event_source_url: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://app.lurvox.in').replace(/\/+$/, '')}/checkout`,
            user_data: userData,
            custom_data: {
              currency: input.currency,
              value: input.amountPaise / 100,
              content_ids: [input.planSlug],
              content_type: 'product',
            },
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = `Meta CAPI HTTP ${response.status}`
      await admin
        .from('purchases')
        .update({ meta_purchase_status: 'failed', meta_purchase_error: error })
        .eq('id', input.purchaseId)
      return { ok: false, eventId, error }
    }

    await admin
      .from('purchases')
      .update({
        meta_purchase_status: 'sent',
        meta_purchase_sent_at: new Date().toISOString(),
        meta_purchase_error: null,
      })
      .eq('id', input.purchaseId)
    return { ok: true, eventId }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Meta CAPI request failed'
    await admin
      .from('purchases')
      .update({ meta_purchase_status: 'failed', meta_purchase_error: message })
      .eq('id', input.purchaseId)
    return { ok: false, eventId, error: message }
  }
}
