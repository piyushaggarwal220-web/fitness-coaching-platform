import { NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/ai-marketing/auth'
import { syncMetaMarketingData } from '@/lib/ai-marketing/meta/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await syncMetaMarketingData({ actorId: null })
  return NextResponse.json(result, { status: result.ok || result.mode === 'unconfigured' ? 200 : 500 })
}

export async function POST(request: Request) {
  return GET(request)
}
