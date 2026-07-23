import { NextResponse } from 'next/server'
import { updateTrackerCompletion, type TrackerCompletion } from '@/lib/daily-tracker'
import { requireEntitledClientApiUser } from '@/lib/client-entitlement-guard'

type Body = {
  dayId?: string
  completion?: TrackerCompletion
}

export async function PATCH(request: Request) {
  const auth = await requireEntitledClientApiUser()
  if (!auth.ok) return auth.response

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
    return NextResponse.json({ error: error ?? 'Update failed' }, { status: 400 })
  }

  return NextResponse.json({ day })
}
