import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import {
  getAiSensyConfigStatus,
  sendAiSensyCampaign,
} from '@/lib/notifications/whatsapp-provider'
import { normalizePhoneForWhatsApp } from '@/lib/phone'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  return NextResponse.json({
    ok: true,
    ...getAiSensyConfigStatus(),
  })
}

/** POST { phone, campaignEnv? } — send a live probe to your number. */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    phone?: string
    campaignEnv?: string
  }

  const status = getAiSensyConfigStatus()
  if (!status.apiKeyConfigured) {
    return NextResponse.json(
      { error: 'AISENSY_API_KEY is not set on this deployment' },
      { status: 400 }
    )
  }

  const campaignEnv =
    body.campaignEnv?.trim() ||
    (status.campaigns.AISENSY_CAMPAIGN_CHECKIN_DUE
      ? 'AISENSY_CAMPAIGN_CHECKIN_DUE'
      : status.campaigns.AISENSY_CAMPAIGN_ACCOUNT_SETUP
        ? 'AISENSY_CAMPAIGN_ACCOUNT_SETUP'
        : status.campaigns.AISENSY_CAMPAIGN_PLAN_READY
          ? 'AISENSY_CAMPAIGN_PLAN_READY'
          : null)

  if (!campaignEnv) {
    return NextResponse.json(
      {
        error:
          'No AiSensy campaign env vars are set. Add exact campaign names from the AiSensy dashboard.',
        status,
      },
      { status: 400 }
    )
  }

  const campaignName = process.env[campaignEnv]?.trim()
  if (!campaignName) {
    return NextResponse.json({ error: `${campaignEnv} is empty`, status }, { status: 400 })
  }

  const destination = normalizePhoneForWhatsApp(body.phone)
  if (!destination) {
    return NextResponse.json(
      { error: 'Provide a valid phone (e.g. +91 98765 43210)' },
      { status: 400 }
    )
  }

  const result = await sendAiSensyCampaign({
    campaignName,
    destination,
    userName: 'Admin Probe',
    templateParams: ['Admin', 'AiSensy connection test'],
  })

  return NextResponse.json({
    ok: result.ok,
    error: result.error ?? null,
    providerMessageId: result.providerMessageId ?? null,
    usedCampaignEnv: campaignEnv,
    config: status,
  })
}
