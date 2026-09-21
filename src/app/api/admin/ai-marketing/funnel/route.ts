import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { analyzeFunnel } from '@/lib/ai-marketing/agents/funnel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  try {
    const result = await analyzeFunnel({ actorId: auth.user.id })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
