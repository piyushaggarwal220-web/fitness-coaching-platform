import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/ai-marketing/auth'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'
import { runDailyMarketingCycle } from '@/lib/ai-marketing/brain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const level = await getAutonomyLevel()
  if (level === 0) {
    return NextResponse.json({ skipped: true, reason: 'autonomy level 0' })
  }

  try {
    const result = await runDailyMarketingCycle({ actorId: null })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    console.error('[cron/ai-marketing-analyze]', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
