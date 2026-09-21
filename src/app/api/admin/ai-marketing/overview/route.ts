import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { getMarketingOverview } from '@/lib/ai-marketing/overview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  try {
    const overview = await getMarketingOverview()
    return NextResponse.json({ success: true, overview })
  } catch (error) {
    console.error('[ai-marketing/overview]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
