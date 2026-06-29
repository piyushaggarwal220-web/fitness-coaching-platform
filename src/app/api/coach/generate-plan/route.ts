import { NextResponse } from 'next/server'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { generatePlan, GeneratePlanError } from '@/lib/ai/generate-plan'
import { generatedPlanToFormData } from '@/lib/ai/plan-format'
import { createClient } from '@/lib/supabase/server'
import type { Checkin, OnboardingProfile } from '@/types/database'

type GeneratePlanRequestBody = {
  clientId?: string
  coachInstructions?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
  }

  const { data: coach, error: coachError } = await supabase
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (coachError || !coach) {
    return NextResponse.json({ success: false, error: 'Coach access required' }, { status: 403 })
  }

  let body: GeneratePlanRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const clientId = body.clientId?.trim()
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'clientId is required' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ success: false, error: profileError.message }, { status: 500 })
  }

  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'Client not found or not assigned to you' },
      { status: 404 }
    )
  }

  const { data: latestCheckin, error: checkinError } = await supabase
    .from('checkins')
    .select('*')
    .eq('client_id', clientId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (checkinError) {
    return NextResponse.json({ success: false, error: checkinError.message }, { status: 500 })
  }

  const startedAt = Date.now()

  try {
    const result = await generatePlan({
      profile: profile as OnboardingProfile,
      latestCheckin: (latestCheckin as Checkin | null) ?? null,
      coachInstructions: body.coachInstructions ?? null,
    })

    const formData = generatedPlanToFormData(result.generatedPlan, clientId)

    return NextResponse.json({
      success: true,
      formData,
      generatedPlan: result.generatedPlan,
      complexityScore: result.complexityScore,
      selectedModel: result.model,
      estimatedTokens: result.estimatedTokens,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      generationTimeMs: Date.now() - startedAt,
    })
  } catch (err) {
    if (err instanceof ClaudeResponseError) {
      const detail = err.status ? ` (HTTP ${err.status})` : ''
      return NextResponse.json(
        {
          success: false,
          error: `Anthropic plan generation failed${detail}: ${err.message}`,
        },
        { status: err.status && err.status >= 400 && err.status < 600 ? err.status : 502 }
      )
    }

    const message =
      err instanceof GeneratePlanError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Plan generation failed'

    const status = err instanceof GeneratePlanError ? 422 : 500

    return NextResponse.json({ success: false, error: message }, { status })
  }
}
