import { NextResponse } from 'next/server'
import { ClaudeResponseError } from '@/lib/ai/anthropic'
import { GeneratePlanError } from '@/lib/ai/generate-plan'
import { generateRemadeCompletePlan } from '@/lib/coach/remake-plan'
import { coachRequiresManualPlanDelivery } from '@/lib/coach-delivery-policy'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile } from '@/types/database'

/** Four sequential plan sections — allow several minutes. */
export const maxDuration = 300

type Body = {
  clientId?: string
  coachInstruction?: string
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
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
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

  if (coachRequiresManualPlanDelivery(coach.id) && !profile.journey_goal?.trim()) {
    return NextResponse.json(
      { error: 'Set the client journey plan on their profile before remaking a plan.' },
      { status: 422 }
    )
  }

  const admin = createAdminClient()
  const started = Date.now()

  try {
    const formData = await generateRemadeCompletePlan({
      admin,
      profile: profile as OnboardingProfile,
      coachInstruction: body.coachInstruction?.trim() || null,
    })

    return NextResponse.json({
      success: true,
      formData: {
        ...formData,
        client_id: clientId,
      },
      generationTimeMs: Date.now() - started,
    })
  } catch (err) {
    const message =
      err instanceof GeneratePlanError || err instanceof ClaudeResponseError || err instanceof Error
        ? err.message
        : 'Plan remake failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
