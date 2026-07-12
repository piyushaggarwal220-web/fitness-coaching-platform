import { NextResponse } from 'next/server'
import { getLatestDraftLogForCheckin } from '@/lib/ai/draft-workflow-log'
import { loadLatestAiDraftForClient } from '@/lib/ai/weekly-plan-draft'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
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

  const url = new URL(request.url)
  const clientId = url.searchParams.get('clientId')?.trim()
  const checkinId = url.searchParams.get('checkinId')?.trim()
  if (!clientId || !checkinId) {
    return NextResponse.json({ error: 'clientId and checkinId are required' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const { data: checkin } = await supabase
    .from('checkins')
    .select('submitted_at, coaching_week')
    .eq('id', checkinId)
    .eq('client_id', clientId)
    .maybeSingle()

  const draft = await loadLatestAiDraftForClient(clientId, checkinId)
  const log = await getLatestDraftLogForCheckin(clientId, checkinId)

  const generationFailed = !draft && log?.success === false
  const submittedAt = checkin?.submitted_at ? new Date(checkin.submitted_at).getTime() : 0
  const recentSubmit = submittedAt > 0 && Date.now() - submittedAt < 12 * 60 * 1000
  const isGenerating = !draft && !generationFailed && recentSubmit

  return NextResponse.json({
    hasDraft: Boolean(draft),
    draftPlanId: draft?.id ?? null,
    generationFailed,
    isGenerating,
    failureError: generationFailed && log ? null : null,
    checkinWeek: checkin?.coaching_week ?? null,
  })
}
