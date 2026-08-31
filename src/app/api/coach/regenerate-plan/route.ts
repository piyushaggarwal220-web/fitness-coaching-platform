import { NextResponse } from 'next/server'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { regeneratePlanWithCoachInstruction } from '@/lib/coach/regenerate-plan-with-coach'
import { createClient } from '@/lib/supabase/server'
import type { OnboardingProfile } from '@/types/database'

/** Diet + workout rewrites — allow several minutes. */
export const maxDuration = 300

type Body = {
  clientId?: string
  coachInstruction?: string
  nutrition_plan?: string
  workout_plan?: string
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
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
  }
  if (!coachInstruction) {
    return NextResponse.json({ error: 'coachInstruction is required' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const started = Date.now()

  try {
    const sections = await regeneratePlanWithCoachInstruction({
      profile: profile as OnboardingProfile,
      draft: {
        nutrition_plan: body.nutrition_plan ?? '',
        workout_plan: body.workout_plan ?? '',
      },
      coachInstruction,
    })

    return NextResponse.json({
      success: true,
      formData: sections,
      generationTimeMs: Date.now() - started,
    })
  } catch (err) {
    const message =
      err instanceof ClaudeResponseError || err instanceof Error ? err.message : 'Plan regeneration failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
