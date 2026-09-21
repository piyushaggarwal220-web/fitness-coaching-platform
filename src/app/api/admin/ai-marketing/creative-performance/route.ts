import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { listCreativePerformance } from '@/lib/ai-marketing/creative-performance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const funnelId = url.searchParams.get('funnelId') || undefined
  const days = Math.min(90, Number(url.searchParams.get('days') || 30))

  try {
    const rows = await listCreativePerformance({ funnelId, days })
    return NextResponse.json({ success: true, creatives: rows })
  } catch (error) {
    console.error('[ai-marketing/creative-performance]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
