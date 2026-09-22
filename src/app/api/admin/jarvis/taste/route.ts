import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import {
  getTasteProfile,
  confirmTastePreference,
  rejectTastePreference,
  listEvidenceForPreference,
  listTastePreferences,
  explainPreference,
} from '@/lib/jarvis/taste'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  try {
    const profile = await getTasteProfile()
    return NextResponse.json({ success: true, profile })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load taste profile',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    preference_id?: string
    scope?: string
  }

  if (!body.preference_id || !body.action) {
    return NextResponse.json(
      { success: false, error: 'action and preference_id required' },
      { status: 400 }
    )
  }

  try {
    if (body.action === 'confirm') {
      const result = await confirmTastePreference({
        preference_id: body.preference_id,
        scope: body.scope as import('@/lib/jarvis/taste').TasteScope | undefined,
        actorId: auth.user.id,
      })
      return NextResponse.json({ success: result.ok, ...result })
    }
    if (body.action === 'reject') {
      const result = await rejectTastePreference({
        preference_id: body.preference_id,
        actorId: auth.user.id,
      })
      return NextResponse.json({ success: result.ok, ...result })
    }
    if (body.action === 'explain') {
      const prefs = await listTastePreferences({ limit: 100 })
      const pref = prefs.find((p) => p.id === body.preference_id)
      if (!pref) {
        return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
      }
      const evidence = await listEvidenceForPreference(body.preference_id)
      const explained = explainPreference({ preference: pref, evidence })
      return NextResponse.json({ success: true, ...explained })
    }
    return NextResponse.json({ success: false, error: 'unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Taste action failed',
      },
      { status: 500 }
    )
  }
}
