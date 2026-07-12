/**
 * WhatsApp notification provider — stub ready for integration.
 * Register with registerChannelProvider() when a WhatsApp provider is configured.
 *
 * Supported reminder types:
 * - weekly_checkin_reminder
 * - plan_available
 * - coach_replied
 * - missed_checkin
 */

import { registerChannelProvider } from '@/lib/notifications/service'
import type { NotificationPayload } from '@/lib/notifications/service'

const WHATSAPP_ENABLED_TYPES = new Set([
  'weekly_checkin_reminder',
  'plan_available',
  'coach_replied',
  'missed_checkin',
  'plan_delivered',
])

export type WhatsAppProviderConfig = {
  apiUrl?: string
  apiKey?: string
  phoneNumberId?: string
}

function getConfig(): WhatsAppProviderConfig {
  return {
    apiUrl: process.env.WHATSAPP_API_URL,
    apiKey: process.env.WHATSAPP_API_KEY,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  }
}

export function isWhatsAppConfigured(): boolean {
  const config = getConfig()
  return Boolean(config.apiUrl && config.apiKey && config.phoneNumberId)
}

async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const config = getConfig()
  if (!isWhatsAppConfigured()) {
    return { ok: false, error: 'WhatsApp not configured' }
  }

  try {
    const response = await fetch(`${config.apiUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        phone_number_id: config.phoneNumberId,
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, error: `WhatsApp API error: ${text}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'WhatsApp send failed' }
  }
}

/** Register the WhatsApp channel provider. Call once at app startup. */
export function initWhatsAppProvider(): void {
  registerChannelProvider({
    channel: 'whatsapp',
    send: async (payload: NotificationPayload & { notificationId: string }) => {
      if (!WHATSAPP_ENABLED_TYPES.has(payload.type)) {
        return { ok: true }
      }

      if (!isWhatsAppConfigured()) {
        console.log(`[whatsapp] Skipped (not configured): ${payload.type} → ${payload.userId}`)
        return { ok: true }
      }

      const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient())
      const { data: profile } = await admin
        .from('profiles')
        .select('phone')
        .eq('id', payload.userId)
        .maybeSingle()

      const phone = (profile as { phone?: string } | null)?.phone
      if (!phone) {
        return { ok: false, error: 'No phone number on profile' }
      }

      const message = `${payload.title}\n\n${payload.body}`
      return sendWhatsAppMessage(phone, message)
    },
  })
}
