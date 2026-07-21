/**
 * AiSensy WhatsApp campaign provider.
 *
 * POST https://backend.aisensy.com/campaign/t1/api/v2
 *
 * Env:
 * - AISENSY_API_KEY (required to send)
 * - AISENSY_CAMPAIGN_CHECKIN_DUE — weekly_checkin_reminder + mid_week_checkin_reminder
 * - AISENSY_CAMPAIGN_MISSED_CHECKIN — missed_checkin (optional; skip if unset)
 * - AISENSY_CAMPAIGN_PLAN_READY — plan_delivered / plan_available
 * - AISENSY_CAMPAIGN_COACH_REPLIED — coach_replied
 * - AISENSY_CAMPAIGN_ACCOUNT_SETUP — paid account setup recovery
 * - AISENSY_CAMPAIGN_ONBOARDING_REMINDER — onboarding/photo reminders
 *
 * templateParams order (stable — match AiSensy campaign variable slots):
 * - check-in reminders: [firstName, checkinLabel]
 * - plan / coach messages: [firstName, messageSnippet]
 *
 * Opt-in: MVP treats profiles.phone as consent for utility coaching templates
 * (existing coaching relationship). No separate opt-in column.
 *
 * Deprecated: WHATSAPP_API_URL / WHATSAPP_API_KEY / WHATSAPP_PHONE_NUMBER_ID
 * are no longer used. Prefer AiSensy env vars above.
 */

import { registerChannelProvider } from '@/lib/notifications/service'
import type { NotificationPayload } from '@/lib/notifications/service'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import type { NotificationType } from '@/types/database'

const AISENSY_API_URL = 'https://backend.aisensy.com/campaign/t1/api/v2'

const WHATSAPP_ENABLED_TYPES = new Set<NotificationType>([
  'weekly_checkin_reminder',
  'mid_week_checkin_reminder',
  'plan_available',
  'coach_replied',
  'missed_checkin',
  'plan_delivered',
])

type CampaignEnvKey =
  | 'AISENSY_CAMPAIGN_CHECKIN_DUE'
  | 'AISENSY_CAMPAIGN_MISSED_CHECKIN'
  | 'AISENSY_CAMPAIGN_PLAN_READY'
  | 'AISENSY_CAMPAIGN_COACH_REPLIED'

const TYPE_TO_CAMPAIGN_ENV: Partial<Record<NotificationType, CampaignEnvKey>> = {
  weekly_checkin_reminder: 'AISENSY_CAMPAIGN_CHECKIN_DUE',
  mid_week_checkin_reminder: 'AISENSY_CAMPAIGN_CHECKIN_DUE',
  missed_checkin: 'AISENSY_CAMPAIGN_MISSED_CHECKIN',
  plan_delivered: 'AISENSY_CAMPAIGN_PLAN_READY',
  plan_available: 'AISENSY_CAMPAIGN_PLAN_READY',
  coach_replied: 'AISENSY_CAMPAIGN_COACH_REPLIED',
}

function getApiKey(): string | undefined {
  return process.env.AISENSY_API_KEY?.trim() || undefined
}

function getCampaignName(type: NotificationType): string | undefined {
  const envKey = TYPE_TO_CAMPAIGN_ENV[type]
  if (!envKey) return undefined
  return process.env[envKey]?.trim() || undefined
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(getApiKey())
}

function firstNameFrom(name: string | null | undefined, fallback = 'there'): string {
  const trimmed = name?.trim()
  if (!trimmed) return fallback
  return trimmed.split(/\s+/)[0] ?? fallback
}

function buildTemplateParams(
  type: NotificationType,
  payload: NotificationPayload,
  profileName: string | null | undefined
): string[] {
  const firstName = firstNameFrom(
    (payload.metadata?.firstName as string | undefined) ?? profileName
  )
  const meta = payload.metadata ?? {}

  if (type === 'weekly_checkin_reminder' || type === 'mid_week_checkin_reminder') {
    const checkinLabel =
      (meta.checkinLabel as string | undefined) ??
      (type === 'mid_week_checkin_reminder' ? 'Mid-week Check-in' : 'Weekly Check-in')
    return [firstName, checkinLabel]
  }

  if (type === 'missed_checkin') {
    const checkinLabel = (meta.checkinLabel as string | undefined) ?? 'Weekly Check-in'
    return [firstName, checkinLabel]
  }

  const snippet =
    (meta.messageSnippet as string | undefined) ??
    payload.body.slice(0, 100) ??
    payload.title
  return [firstName, snippet]
}

export async function sendAiSensyCampaign(input: {
  campaignName: string
  destination: string
  userName: string
  templateParams: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return { ok: false, error: 'AISENSY_API_KEY not configured' }
  }

  try {
    const response = await fetch(AISENSY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        campaignName: input.campaignName,
        destination: input.destination,
        userName: input.userName,
        templateParams: input.templateParams,
        source: 'lurvox-app',
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, error: `AiSensy API error (${response.status}): ${text}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'AiSensy send failed' }
  }
}

export async function sendDirectWhatsApp(input: {
  campaignEnv: 'AISENSY_CAMPAIGN_ACCOUNT_SETUP' | 'AISENSY_CAMPAIGN_ONBOARDING_REMINDER'
  phone: string | null | undefined
  name: string | null | undefined
  templateParams: string[]
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const destination = normalizePhoneForWhatsApp(input.phone)
  const campaignName = process.env[input.campaignEnv]?.trim()
  if (!getApiKey() || !campaignName || !destination) {
    console.info(`[whatsapp] Skipped direct lifecycle send (${input.campaignEnv})`)
    return { ok: true, skipped: true }
  }

  return sendAiSensyCampaign({
    campaignName,
    destination,
    userName: input.name?.trim() || firstNameFrom(input.name),
    templateParams: input.templateParams,
  })
}

/** Register the WhatsApp channel provider. Call once at app startup. */
export function initWhatsAppProvider(): void {
  registerChannelProvider({
    channel: 'whatsapp',
    send: async (payload: NotificationPayload & { notificationId: string }) => {
      if (!WHATSAPP_ENABLED_TYPES.has(payload.type)) {
        return { ok: true }
      }

      const apiKey = getApiKey()
      if (!apiKey) {
        console.log(`[whatsapp] Skipped (AISENSY_API_KEY unset): ${payload.type} → ${payload.userId}`)
        return { ok: true }
      }

      const campaignName = getCampaignName(payload.type)
      if (!campaignName) {
        console.log(
          `[whatsapp] Skipped (campaign unset for ${payload.type}): ${payload.userId}`
        )
        return { ok: true }
      }

      const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient())
      const { data: profile } = await admin
        .from('profiles')
        .select('phone, name')
        .eq('id', payload.userId)
        .maybeSingle()

      const row = profile as { phone?: string | null; name?: string | null } | null
      const destination = normalizePhoneForWhatsApp(row?.phone)
      if (!destination) {
        console.log(`[whatsapp] Skipped (invalid/missing phone): ${payload.type} → ${payload.userId}`)
        return { ok: true }
      }

      const userName = row?.name?.trim() || firstNameFrom(row?.name)
      const templateParams = buildTemplateParams(payload.type, payload, row?.name)

      const result = await sendAiSensyCampaign({
        campaignName,
        destination,
        userName,
        templateParams,
      })

      if (!result.ok) {
        console.error(`[whatsapp] Send failed: ${payload.type} → ${payload.userId}: ${result.error}`)
      }

      return result
    },
  })
}
