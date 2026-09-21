import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { buildActivityFeed } from '@/lib/jarvis/operator-activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  try {
    const activity = await buildActivityFeed(80)
    return NextResponse.json({ success: true, activity })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load activity' },
      { status: 500 }
    )
  }
}
