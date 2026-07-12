import { NextResponse } from 'next/server'
import { sanitizeDraftFailureError } from '@/lib/ai/draft-error'
import { generateWeeklyPlanDraft } from '@/lib/ai/weekly-plan-draft'
import { createClient } from '@/lib/supabase/server'

type Body = {
  clientId?: string
  checkinId?: string
  coachingWeek?: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  if (!coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const clientId = body.clientId?.trim()
  const checkinId = body.checkinId?.trim()
  if (!clientId || !checkinId) {
    return NextResponse.json({ error: 'clientId and checkinId are required' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('profiles')
    .select('id, coach_id')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const { data: checkin } = await supabase
    .from('checkins')
    .select('coaching_week')
    .eq('id', checkinId)
    .eq('client_id', clientId)
    .maybeSingle()

  const coachingWeek = body.coachingWeek ?? checkin?.coaching_week ?? 0

  const result = await generateWeeklyPlanDraft({
    clientId,
    coachId: coach.id,
    checkinId,
    coachingWeek,
    trigger: 'retry',
  })

  if (result.error) {
    return NextResponse.json(
      {
        success: false,
        error: sanitizeDraftFailureError(result.error),
        generationTimeMs: result.generationTimeMs,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    planId: result.planId,
    generationTimeMs: result.generationTimeMs,
  })
}
