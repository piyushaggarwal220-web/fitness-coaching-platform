import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { approveMarketingAction } from '@/lib/ai-marketing/decision-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json()) as { actionId?: string; approve?: boolean }
  if (!body.actionId || typeof body.approve !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'actionId and approve required' },
      { status: 400 }
    )
  }

  const result = await approveMarketingAction({
    actionId: body.actionId,
    actorId: auth.user.id,
    approve: body.approve,
  })

  return NextResponse.json(
    { success: result.ok, ...result },
    { status: result.ok ? 200 : 400 }
  )
}
