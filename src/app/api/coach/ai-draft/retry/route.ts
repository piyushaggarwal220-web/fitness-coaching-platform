import { after, NextResponse } from 'next/server'
import { sanitizeDraftFailureError } from '@/lib/ai/draft-error'
import { persistDraftGenerationStarted } from '@/lib/ai/draft-workflow-log'
import { generateWeeklyPlanDraft } from '@/lib/ai/weekly-plan-draft'
import { createClient } from '@/lib/supabase/server'

/** Background weekly draft pipeline (diet → workout → support). */
export const maxDuration = 300

type Body = {
  clientId?: string
  checkinId?: string
  coachingWeek?: number
  coachNote?: string | null
  /** Defaults to retry; panel "Generate" uses manual. */
  trigger?: 'manual' | 'retry'
  /**
   * When true (default), queue work with after() and return 202 so browser/proxy
   * timeouts cannot mark a still-running job as failed.
   */
  async?: boolean
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

  const trigger = body.trigger === 'manual' ? 'manual' : 'retry'
  const runAsync = body.async !== false
  const coachNote = body.coachNote?.trim() || null

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
    .select('coaching_week, checkin_type')
    .eq('id', checkinId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!checkin) {
    return NextResponse.json({ error: 'Check-in not found' }, { status: 404 })
  }
  if (checkin.checkin_type !== 'weekly') {
    return NextResponse.json(
      { error: 'Mid-week check-ins only require a reply in coach chat.' },
      { status: 409 }
    )
  }

  const coachingWeek = body.coachingWeek ?? checkin.coaching_week ?? 0

  const jobInput = {
    clientId,
    coachId: coach.id as string,
    checkinId,
    coachingWeek,
    trigger,
    coachNote,
  } as const

  if (runAsync) {
    // Mark in-flight before returning so the status endpoint shows Generating immediately.
    await persistDraftGenerationStarted({
      clientId,
      coachId: coach.id,
      checkinId,
      trigger,
    })

    after(() =>
      generateWeeklyPlanDraft(jobInput).catch((err) => {
        console.error(
          '[coach/ai-draft/retry] background draft failed:',
          err instanceof Error ? err.message : err
        )
      })
    )

    return NextResponse.json(
      {
        success: true,
        queued: true,
        trigger,
      },
      { status: 202 }
    )
  }

  const result = await generateWeeklyPlanDraft(jobInput)

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
