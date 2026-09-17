import { NextResponse } from 'next/server'
import { updateTrackerCompletion, type TrackerCompletion } from '@/lib/daily-tracker'
import { requireEntitledClientApiUser } from '@/lib/client-entitlement-guard'

type Body = {
  dayId?: string
  completion?: TrackerCompletion
}

export async function PATCH(request: Request) {
  const auth = await requireEntitledClientApiUser({ mutation: true })
  if (!auth.ok) {
    // Normalize auth/entitlement payloads so the client always reads `error`.
    const payload = (await auth.response
      .clone()
      .json()
      .catch(() => null)) as { error?: string; code?: string; success?: boolean } | null
    return NextResponse.json(
      {
        error: payload?.error ?? 'Authentication required',
        code: payload?.code,
        success: false,
      },
      { status: auth.response.status }
    )
  }

  const { data: gateProfile } = await auth.supabase
    .from('profiles')
    .select(
      'instant_gates_enabled, addon_tracker_entitled, addon_journey_entitled, addon_ai_chat_entitled, access_source'
    )
    .eq('id', auth.user.id)
    .maybeSingle()
  const { assertInstantFeatureAccess } = await import('@/lib/instant-feature-guard')
  const denied = await assertInstantFeatureAccess(auth.user.id, gateProfile ?? {}, 'tracker')
  if (denied) return denied

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const dayId = body.dayId?.trim()
  if (!dayId || !body.completion) {
    return NextResponse.json({ error: 'dayId and completion are required' }, { status: 400 })
  }

  const { day, error } = await updateTrackerCompletion(
    auth.supabase,
    auth.user.id,
    dayId,
    body.completion
  )

  if (error || !day) {
    const conflict = Boolean(error?.includes('another update finished first'))
    return NextResponse.json(
      { error: error ?? 'Update failed' },
      { status: conflict ? 409 : 400 }
    )
  }

  return NextResponse.json({ day })
}
