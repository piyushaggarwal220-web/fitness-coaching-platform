import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { buildBudgetRecommendations } from '@/lib/ai-marketing/budget-recommendations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** AI recommends budget changes; human must approve. Does not move money. */
export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as { days?: number }

  try {
    const result = await buildBudgetRecommendations({
      actorId: auth.user.id,
      days: body.days ?? 14,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[ai-marketing/budget-recommendations]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  try {
    const result = await buildBudgetRecommendations({ actorId: auth.user.id })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
