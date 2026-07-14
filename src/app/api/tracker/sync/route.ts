import { NextResponse } from 'next/server'
import { refreshTodayTrackerAfterPlanPublish } from '@/lib/daily-tracker'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { OnboardingProfile, Plan } from '@/types/database'

type Body = { clientId?: string; planId?: string }

/** Rebuild today's tracker after plan publish or an active-plan edit (server-side, bypasses client RLS). */
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
  const planId = body.planId?.trim()
  if (!clientId || !planId) {
    return NextResponse.json({ error: 'clientId and planId are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const { data: plan } = await admin.from('plans').select('*').eq('id', planId).eq('client_id', clientId).single()

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  await refreshTodayTrackerAfterPlanPublish(
    admin,
    clientId,
    plan as Plan,
    client as OnboardingProfile
  )

  return NextResponse.json({ success: true })
}
