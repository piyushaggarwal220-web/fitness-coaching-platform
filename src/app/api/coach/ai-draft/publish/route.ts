import { NextResponse } from 'next/server'
import { logDraftWorkflow } from '@/lib/ai/draft-workflow-log'
import { activatePlan } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type Body = {
  clientId?: string
  planId?: string
  checkinId?: string | null
  checkinWeek?: number | null
}

/**
 * Publish an AI draft using the service-role client so deactivate/activate
 * cannot be blocked by coach-scoped RLS on orphaned active plans.
 */
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

  const { data: client } = await supabase
    .from('profiles')
    .select('id, coach_id')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, client_id, coach_id, title, version, active')
    .eq('id', planId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 })
  }
  if (!plan) {
    return NextResponse.json({ error: 'Draft plan not found' }, { status: 404 })
  }
  if (plan.coach_id !== coach.id) {
    return NextResponse.json(
      { error: 'Cannot publish: plan coach does not match your coach account.' },
      { status: 403 }
    )
  }
  if (plan.active) {
    return NextResponse.json({ success: true, alreadyActive: true, planId: plan.id })
  }

  const { error: activateError } = await activatePlan(admin, {
    id: plan.id,
    client_id: plan.client_id,
    coach_id: plan.coach_id,
  })

  if (activateError) {
    return NextResponse.json({ success: false, error: activateError }, { status: 422 })
  }

  logDraftWorkflow({
    event: 'publish_completed',
    clientId,
    coachId: coach.id,
    checkinId: body.checkinId ?? null,
    checkinWeek: body.checkinWeek ?? null,
    planId: plan.id,
    planVersion: plan.version,
  })

  return NextResponse.json({
    success: true,
    planId: plan.id,
    planVersion: plan.version,
  })
}
