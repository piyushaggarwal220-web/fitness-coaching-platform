import {
  getAutonomyLevel,
  getBrandContext,
  getGuardrails,
  saveGuardrails,
  setAutonomyLevel,
  setSetting,
  getSetting,
} from '@/lib/ai-marketing/settings'
import type { AutonomyLevel, GuardrailSettings } from '@/lib/ai-marketing/types'
import { getMetaIntegrationStatus } from '@/lib/ai-marketing/meta/client'
import { writeMarketingAudit } from '@/lib/ai-marketing/audit'
import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const [autonomyLevel, guardrails, brand, metaState] = await Promise.all([
    getAutonomyLevel(),
    getGuardrails(),
    getBrandContext(),
    getSetting<{ last_sync_at?: string | null; last_sync_error?: string | null }>(
      'meta_integration',
      {}
    ),
  ])

  return NextResponse.json({
    success: true,
    settings: {
      autonomyLevel,
      guardrails,
      brand,
      meta: getMetaIntegrationStatus(metaState),
      liveMetaExecutionEnabled: process.env.LIVE_META_EXECUTION_ENABLED === 'true',
    },
  })
}

export async function PUT(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json()) as {
    autonomyLevel?: number
    confirmHighAutonomy?: boolean
    guardrails?: Partial<GuardrailSettings>
    brand?: Record<string, unknown>
  }

  if (typeof body.autonomyLevel === 'number') {
    const level = body.autonomyLevel as AutonomyLevel
    const result = await setAutonomyLevel(level, {
      confirmHighAutonomy: Boolean(body.confirmHighAutonomy),
      updatedBy: auth.user.id,
    })
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }
  }

  if (body.guardrails) {
    await saveGuardrails(body.guardrails, auth.user.id)
  }

  if (body.brand) {
    await setSetting('brand', body.brand, auth.user.id)
  }

  await writeMarketingAudit({
    agent: 'settings',
    decision: 'settings_updated',
    actor_id: auth.user.id,
    input_summary: {
      autonomyLevel: body.autonomyLevel,
      guardrailKeys: body.guardrails ? Object.keys(body.guardrails) : [],
    },
  })

  return GET()
}
