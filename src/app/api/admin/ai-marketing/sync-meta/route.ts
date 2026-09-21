import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { syncMetaMarketingData } from '@/lib/ai-marketing/meta/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  try {
    const result = await syncMetaMarketingData({ actorId: auth.user.id })
    return NextResponse.json({ success: result.ok, result })
  } catch (error) {
    console.error('[ai-marketing/sync-meta]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
