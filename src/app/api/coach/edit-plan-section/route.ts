import { NextResponse } from 'next/server'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { editPlanSection, type PlanSectionKind } from '@/lib/ai/edit-plan-section'
import { createClient } from '@/lib/supabase/server'

/** Section rewrites run a long Claude call. */
export const maxDuration = 300

type Body = {
  clientId?: string
  section?: string
  currentText?: string
  /** Coach-facing instruction (plan editor). */
  coachInstruction?: string
  /** Legacy / client change-request field. */
  clientRequest?: string
  coachNote?: string
  remakeFromScratch?: boolean
}

function isSection(value: string | undefined): value is PlanSectionKind {
  return value === 'nutrition' || value === 'workout'
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
  const coachInstruction = body.coachInstruction?.trim()
  const clientRequest = body.clientRequest?.trim()
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }
  if (!isSection(body.section)) {
    return NextResponse.json({ error: 'section must be nutrition or workout' }, { status: 400 })
  }
  if (!coachInstruction && !clientRequest && body.section !== 'nutrition' && body.remakeFromScratch !== true) {
    return NextResponse.json(
      { error: 'coachInstruction or clientRequest is required' },
      { status: 400 }
    )
  }

  const { data: client } = await supabase
    .from('profiles')
    .select(
      'id, name, payment_confirmed, access_source, subscription_expires_at, weight, height, age, gender, activity_level, fitness_goal, onboarding_data, sleep_duration, training_experience, injuries'
    )
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  try {
    const result = await editPlanSection({
      section: body.section,
      currentText: body.currentText ?? '',
      coachInstruction: coachInstruction || undefined,
      clientRequest: clientRequest || undefined,
      coachNote: body.coachNote,
      editSource: coachInstruction ? 'coach' : 'client',
      remakeFromScratch: body.remakeFromScratch === true,
      clientName: client.name,
      clientId,
      profile: client,
    })

    return NextResponse.json({
      success: true,
      revisedText: result.revisedText,
      summary: result.summary,
      model: result.model,
    })
  } catch (err) {
    const message =
      err instanceof ClaudeResponseError || err instanceof Error
        ? err.message
        : 'Failed to revise plan section'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
