import { NextResponse } from 'next/server'
import { generatePlan, GeneratePlanError } from '@/lib/ai/generate-plan'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isDevToolkitEnabledServer } from '@/lib/dev-mode'
import { getDevAdminEmail, isTestModeServer } from '@/lib/test-mode'
import { getPlanProviderMode } from '@/lib/ai/plan-provider'
import type { Checkin, OnboardingProfile } from '@/types/database'

type TestPlanRequestBody = {
  clientId?: string
  coachInstructions?: string
}

async function assertTestPlanAccess() {
  if (!isDevToolkitEnabledServer() && !isTestModeServer()) {
    return NextResponse.json(
      { success: false, error: 'AI test API disabled outside development' },
      { status: 403 }
    )
  }

  if (getPlanProviderMode() === 'claude' && !process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { success: false, error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 500 }
    )
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY is required for AI test operations' },
      { status: 500 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    )
  }

  const adminEmail = getDevAdminEmail()
  if (adminEmail && user.email !== adminEmail) {
    return NextResponse.json(
      { success: false, error: 'Admin access only' },
      { status: 403 }
    )
  }

  return null
}

async function loadClientData(clientId: string): Promise<{
  profile: OnboardingProfile | null
  latestCheckin: Checkin | null
  error: string | null
}> {
  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()

  if (profileError) {
    return { profile: null, latestCheckin: null, error: profileError.message }
  }

  if (!profile) {
    return { profile: null, latestCheckin: null, error: 'Client not found' }
  }

  const { data: latestCheckin, error: checkinError } = await admin
    .from('checkins')
    .select('*')
    .eq('client_id', clientId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (checkinError) {
    return { profile: null, latestCheckin: null, error: checkinError.message }
  }

  return {
    profile: profile as OnboardingProfile,
    latestCheckin: (latestCheckin as Checkin | null) ?? null,
    error: null,
  }
}

export async function POST(request: Request) {
  const denied = await assertTestPlanAccess()
  if (denied) return denied

  let body: TestPlanRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const clientId = body.clientId?.trim()
  if (!clientId) {
    return NextResponse.json(
      { success: false, error: 'clientId is required' },
      { status: 400 }
    )
  }

  const { profile, latestCheckin, error: loadError } = await loadClientData(clientId)
  if (loadError || !profile) {
    return NextResponse.json(
      { success: false, error: loadError ?? 'Client not found' },
      { status: 404 }
    )
  }

  const startedAt = Date.now()

  try {
    const result = await generatePlan({
      profile,
      latestCheckin,
      coachInstructions: body.coachInstructions ?? null,
    })

    return NextResponse.json({
      success: true,
      generatedPlan: result.generatedPlan,
      complexityScore: result.complexityScore,
      selectedModel: result.model,
      estimatedTokens: result.estimatedTokens,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      generationTimeMs: Date.now() - startedAt,
    })
  } catch (err) {
    const message = err instanceof GeneratePlanError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Plan generation failed'

    const status = err instanceof GeneratePlanError ? 422 : 500

    return NextResponse.json(
      { success: false, error: message },
      { status }
    )
  }
}
