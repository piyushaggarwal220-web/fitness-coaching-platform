import { NextResponse } from 'next/server'
import {
  recalculateClientComplexityAdmin,
  type ComplexityTriggerSource,
} from '@/lib/complexity/recalculate'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

const TRIGGERS = new Set<ComplexityTriggerSource>([
  'onboarding_complete',
  'weekly_checkin',
  'profile_edit_client',
  'profile_edit_coach',
  'profile_edit_admin',
  'manual',
])

type Body = {
  clientId?: string
  trigger?: ComplexityTriggerSource
  checkinId?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const trigger = body.trigger ?? 'manual'
  if (!TRIGGERS.has(trigger)) {
    return NextResponse.json({ error: 'Invalid trigger.' }, { status: 400 })
  }

  const { data: actor } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = actor?.role ? isAdminRole(actor.role) : false

  let clientId = body.clientId?.trim() || user.id

  if (!isAdmin && clientId !== user.id) {
    const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
    if (!coach?.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: client } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', clientId)
      .eq('coach_id', coach.id)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    }

    const coachAllowed: ComplexityTriggerSource[] = [
      'weekly_checkin',
      'profile_edit_coach',
      'manual',
    ]
    if (!coachAllowed.includes(trigger)) {
      return NextResponse.json({ error: 'Invalid trigger for coach.' }, { status: 400 })
    }
  } else if (!isAdmin && clientId === user.id) {
    const allowedClientTriggers: ComplexityTriggerSource[] = [
      'onboarding_complete',
      'weekly_checkin',
      'profile_edit_client',
    ]
    if (!allowedClientTriggers.includes(trigger)) {
      return NextResponse.json({ error: 'Invalid trigger for client.' }, { status: 400 })
    }
  }

  try {
    const result = await recalculateClientComplexityAdmin(clientId, {
      trigger,
      checkinId: body.checkinId,
      requireOnboardingComplete: trigger !== 'onboarding_complete',
    })

    if (!result) {
      return NextResponse.json({ error: 'Client not found or not eligible.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recalculation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
