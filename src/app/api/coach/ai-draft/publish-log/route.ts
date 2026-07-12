import { NextResponse } from 'next/server'
import { logDraftWorkflow } from '@/lib/ai/draft-workflow-log'
import { createClient } from '@/lib/supabase/server'

type Body = {
  clientId?: string
  planId?: string
  planVersion?: number
  checkinId?: string
  checkinWeek?: number
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
  const planId = body.planId?.trim()
  if (!clientId || !planId) {
    return NextResponse.json({ error: 'clientId and planId are required' }, { status: 400 })
  }

  const { data: plan } = await supabase
    .from('plans')
    .select('id, version, client_id, coach_id')
    .eq('id', planId)
    .eq('client_id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  logDraftWorkflow({
    event: 'publish_completed',
    clientId,
    coachId: coach.id,
    checkinId: body.checkinId ?? null,
    checkinWeek: body.checkinWeek ?? null,
    planId,
    planVersion: body.planVersion ?? plan.version,
    trigger: 'manual',
  })

  return NextResponse.json({ success: true })
}
