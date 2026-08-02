import { NextResponse } from 'next/server'
import { sanitizeDraftFailureError } from '@/lib/ai/draft-error'
import { getLatestDraftLogForCheckin } from '@/lib/ai/draft-workflow-log'
import { loadLatestAiDraftForClient } from '@/lib/ai/weekly-plan-draft'
import { createClient } from '@/lib/supabase/server'

/** How long a "started" log keeps the UI in generating state. */
const GENERATING_WINDOW_MS = 15 * 60 * 1000
/** Fallback when no start log exists (pre-deploy auto jobs). */
const SUBMIT_HEURISTIC_MS = 12 * 60 * 1000

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

  const now = Date.now()
  const submittedAt = checkin?.submitted_at ? new Date(checkin.submitted_at).getTime() : 0
  const submitAgeMs = submittedAt > 0 ? now - submittedAt : Number.POSITIVE_INFINITY
  const logAgeMs = log?.createdAt ? now - new Date(log.createdAt).getTime() : Number.POSITIVE_INFINITY

  const startedInFlight = Boolean(log && log.phase === 'started' && logAgeMs < GENERATING_WINDOW_MS)
  const startedTimedOut = Boolean(log && log.phase === 'started' && logAgeMs >= GENERATING_WINDOW_MS)
  const finishFailed = Boolean(log && log.phase === 'failed')
  const recentSubmitNoLog = !log && submittedAt > 0 && submitAgeMs < SUBMIT_HEURISTIC_MS
  const submitTimedOutNoLog = !draft && !log && submittedAt > 0 && submitAgeMs >= SUBMIT_HEURISTIC_MS

  const generationFailed =
    !draft && (finishFailed || startedTimedOut || submitTimedOutNoLog)
  const isGenerating = !draft && !generationFailed && (startedInFlight || recentSubmitNoLog)

  let failureRaw: string | null = null
  if (generationFailed) {
    if (finishFailed) failureRaw = log?.error ?? null
    else if (startedTimedOut || submitTimedOutNoLog) {
      failureRaw = 'Draft generation timed out. Use Retry to generate again.'
    }
  }

  return NextResponse.json({
    hasDraft: Boolean(draft),
    draftPlanId: draft?.id ?? null,
    generationFailed,
    isGenerating,
    failureError: generationFailed ? sanitizeDraftFailureError(failureRaw) : null,
    checkinWeek: checkin?.coaching_week ?? null,
  })
}
