import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { buildDailyFunnelReport } from '@/lib/ai-marketing/reporting/daily-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  try {
    const report = await buildDailyFunnelReport({ actorId: auth.user.id })
    return NextResponse.json({ success: true, report })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function POST() {
  return GET()
}
