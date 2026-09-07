import { after, NextResponse } from 'next/server'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { editPlanSection, type PlanSectionKind } from '@/lib/ai/edit-plan-section'
import { logAiGeneration } from '@/lib/ai/trace-log'
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
  /** Queue with after() so leaving the page does not cancel the rewrite. */
  async?: boolean
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
      'id, name, payment_confirmed, access_source, subscription_expires_at, weight, height, age, gender, activity_level, fitness_goal, onboarding_data, sleep_duration, training_experience, injuries, diet_preference, medical_notes'
    )
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const job = {
    section: body.section,
    currentText: body.currentText ?? '',
    coachInstruction: coachInstruction || undefined,
    clientRequest: clientRequest || undefined,
    coachNote: body.coachNote,
    editSource: (coachInstruction ? 'coach' : 'client') as 'coach' | 'client',
    remakeFromScratch: body.remakeFromScratch === true,
    clientName: client.name,
    clientId,
    profile: client,
  }

  const runEdit = async () => {
    const started = Date.now()
    try {
      const result = await editPlanSection(job)
      await logAiGeneration({
        clientId,
        coachId: coach.id,
        action: 'coach_section_edit',
        model: result.model,
        latencyMs: Date.now() - started,
        promptTokens: null,
        completionTokens: null,
        retryCount: 0,
        validationResult: 'pass',
        success: true,
        knowledgeRefs: null,
        renderedOutput: {
          section: body.section,
          revisedText: result.revisedText,
          summary: result.summary,
        },
      })
      return result
    } catch (err) {
      const message =
        err instanceof ClaudeResponseError || err instanceof Error
          ? err.message
          : 'Failed to revise plan section'
      await logAiGeneration({
        clientId,
        coachId: coach.id,
        action: 'coach_section_edit',
        model: null,
        latencyMs: Date.now() - started,
        promptTokens: null,
        completionTokens: null,
        retryCount: 0,
        validationResult: 'fail',
        success: false,
        knowledgeRefs: null,
        renderedOutput: { section: body.section, error: message },
      })
      throw err
    }
  }

  const runAsync = body.async !== false
  if (runAsync) {
    await logAiGeneration({
      clientId,
      coachId: coach.id,
      action: 'coach_section_edit_started',
      model: null,
      latencyMs: 0,
      promptTokens: null,
      completionTokens: null,
      retryCount: 0,
      validationResult: 'started',
      success: true,
      knowledgeRefs: null,
      renderedOutput: { section: body.section, phase: 'started' },
    })

    after(() =>
      runEdit().catch((err) => {
        console.error(
          '[coach/edit-plan-section] background edit failed:',
          err instanceof Error ? err.message : err
        )
      })
    )

    return NextResponse.json({ success: true, queued: true }, { status: 202 })
  }

  try {
    const result = await runEdit()
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
