import { NextResponse } from 'next/server'
import { updateTrackerCompletion, type TrackerCompletion } from '@/lib/daily-tracker'
import { createClient } from '@/lib/supabase/server'

type Body = {
  dayId?: string
  completion?: TrackerCompletion
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

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

  const { day, error } = await updateTrackerCompletion(supabase, user.id, dayId, body.completion)

  if (error || !day) {
    return NextResponse.json({ error: error ?? 'Update failed' }, { status: 400 })
  }

  return NextResponse.json({ day })
}
