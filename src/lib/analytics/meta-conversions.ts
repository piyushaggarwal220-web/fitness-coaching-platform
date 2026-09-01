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
  /** Meta browser cookies — improves CAPI match rate when browser pixel is blocked. */
  fbp?: string | null
  fbc?: string | null
  clientIpAddress?: string | null
  clientUserAgent?: string | null
}

type MetaCapiResponse = {
  events_received?: number
  messages?: Array<{ error_type?: string; message?: string }>
  error?: { message?: string; type?: string; code?: number }
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

/** Meta rejects CAPI events older than ~7 days — clamp stale purchase times to now. */
const META_MAX_EVENT_AGE_SEC = 7 * 24 * 60 * 60 - 60

export function resolveMetaPurchaseEventTime(
  preferred?: number,
  nowSec = Math.floor(Date.now() / 1000)
): number {
  if (!preferred || !Number.isFinite(preferred) || preferred <= 0) return nowSec
  const age = nowSec - preferred
  if (age > META_MAX_EVENT_AGE_SEC || age < -300) return nowSec
  return preferred
}

export async function sendMetaPurchase(
  input: MetaPurchaseInput
): Promise<{ ok: boolean; skipped?: boolean; eventId: string; error?: string }> {
  const eventId = metaPurchaseEventId(input.paymentId)
  const pixelId =
    process.env.META_PIXEL_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ||
    // Lurvox production pixel — matches the browser-side default.
    '1195395326212201'
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

  const userData: Record<string, string | string[]> = {
    em: [sha256(normalizedEmail(input.email))],
  }
  const phone = normalizePhoneForWhatsApp(input.phone)
  if (phone) userData.ph = [sha256(phone.replace(/\D/g, ''))]
  const fbp = input.fbp?.trim()
  const fbc = input.fbc?.trim()
  if (fbp) userData.fbp = fbp
  if (fbc) userData.fbc = fbc
  const clientIp = input.clientIpAddress?.trim()
  const clientUa = input.clientUserAgent?.trim()
  if (clientIp) userData.client_ip_address = clientIp
  if (clientUa) userData.client_user_agent = clientUa

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
            event_time: resolveMetaPurchaseEventTime(input.eventTime),
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

    let payload: MetaCapiResponse | null = null
    try {
      payload = (await response.json()) as MetaCapiResponse
    } catch {
      payload = null
    }

    if (!response.ok) {
      const apiMessage = payload?.error?.message?.slice(0, 240)
      const error = apiMessage
        ? `Meta CAPI HTTP ${response.status}: ${apiMessage}`
        : `Meta CAPI HTTP ${response.status}`
      console.error('[meta-capi] Purchase failed', { purchaseId: input.purchaseId, error })
      await admin
        .from('purchases')
        .update({ meta_purchase_status: 'failed', meta_purchase_error: error })
        .eq('id', input.purchaseId)
      return { ok: false, eventId, error }
    }

    const eventsReceived = payload?.events_received ?? 0
    const messageErrors = (payload?.messages ?? [])
      .map((m) => m.message?.trim())
      .filter((m): m is string => Boolean(m))
    if (eventsReceived < 1 || messageErrors.length > 0) {
      const error = (
        messageErrors[0] ||
        payload?.error?.message ||
        `Meta CAPI accepted 0 events (received=${eventsReceived})`
      ).slice(0, 300)
      console.error('[meta-capi] Purchase rejected by Meta', {
        purchaseId: input.purchaseId,
        eventsReceived,
        error,
      })
      await admin
        .from('purchases')
        .update({ meta_purchase_status: 'failed', meta_purchase_error: error })
        .eq('id', input.purchaseId)
      return { ok: false, eventId, error }
    }

    console.info('[meta-capi] Purchase sent', {
      purchaseId: input.purchaseId,
      eventId,
      eventsReceived,
    })
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
