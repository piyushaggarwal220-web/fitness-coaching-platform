import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import {
  getNicheIntelligenceOverview,
  listViralReels,
  listOpportunities,
} from '@/lib/jarvis/instagram/niche'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  try {
    const [overview, reels, opportunities] = await Promise.all([
      getNicheIntelligenceOverview(),
      listViralReels({ limit: 20 }).catch(() => []),
      listOpportunities(20).catch(() => []),
    ])
    return NextResponse.json({ success: true, overview, reels, opportunities })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load niche intelligence',
      },
      { status: 500 }
    )
  }
}
