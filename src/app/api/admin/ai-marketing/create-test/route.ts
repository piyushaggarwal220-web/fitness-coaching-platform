import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { prepareOrCreateMetaTest } from '@/lib/ai-marketing/meta/writes'
import { getAutonomyLevel } from '@/lib/ai-marketing/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * CREATE TEST — preview (default) or execute PAUSED Meta objects after approval.
 * At autonomy 2, execute=true still creates PAUSED only (not ACTIVE).
 */
export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    funnelId?: string
    name?: string
    objective?: string
    dailyBudgetInr?: number
    testDays?: number
    creativeIds?: string[]
    country?: string
    execute?: boolean
  }

  if (!body.funnelId) {
    return NextResponse.json({ success: false, error: 'funnelId required' }, { status: 400 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ success: false, error: 'name required' }, { status: 400 })
  }
  if (!body.dailyBudgetInr || body.dailyBudgetInr <= 0) {
    return NextResponse.json({ success: false, error: 'dailyBudgetInr required' }, { status: 400 })
  }
  if (!Array.isArray(body.creativeIds) || body.creativeIds.length === 0) {
    return NextResponse.json({ success: false, error: 'creativeIds required' }, { status: 400 })
  }

  const autonomy = await getAutonomyLevel()
  const wantsExecute = Boolean(body.execute)

  // Autonomy 2: require explicit execute flag (UI shows preview first, then confirms)
  if (wantsExecute && autonomy <= 1) {
    return NextResponse.json(
      {
        success: false,
        error: 'Autonomy level too low to create Meta objects. Raise to 2+ and approve explicitly.',
      },
      { status: 403 }
    )
  }

  try {
    const result = await prepareOrCreateMetaTest({
      funnelId: body.funnelId,
      name: body.name.trim(),
      objective: body.objective,
      dailyBudgetInr: Number(body.dailyBudgetInr),
      testDays: Math.max(1, Number(body.testDays) || 3),
      creativeIds: body.creativeIds,
      country: body.country,
      actorId: auth.user.id,
      execute: wantsExecute,
    })

    return NextResponse.json(
      {
        success: result.ok,
        preview: result.preview,
        executed: result.executed,
        launchId: result.launchId,
        meta: result.meta,
        error: result.error,
        autonomy_level: autonomy,
      },
      { status: result.ok ? 200 : 400 }
    )
  } catch (error) {
    console.error('[ai-marketing/create-test]', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Create test failed' },
      { status: 500 }
    )
  }
}
