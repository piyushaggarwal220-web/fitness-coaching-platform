import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import {
  buildOperatorSystem,
  testIntegration,
} from '@/lib/jarvis/operator-integrations'
import { sanitizePublicJson } from '@/lib/jarvis/operator-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  ensureJarvisToolsRegistered()
  const system = await buildOperatorSystem()
  return NextResponse.json({
    success: true,
    integrations: sanitizePublicJson(system.integrations),
    health: sanitizePublicJson(system.health),
    capabilities: sanitizePublicJson(system.capabilities),
  })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { id?: string }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) {
    return NextResponse.json({ success: false, error: 'Integration id required.' }, { status: 400 })
  }

  const result = await testIntegration(id)
  return NextResponse.json({
    success: true,
    result: sanitizePublicJson(result),
  })
}
