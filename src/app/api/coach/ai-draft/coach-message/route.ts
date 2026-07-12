import { NextResponse } from 'next/server'
import { ensureClientCoachMessage } from '@/lib/ai/coach-message'
import { createClient } from '@/lib/supabase/server'
import type { Checkin, OnboardingProfile, Plan } from '@/types/database'

type Body = {
  clientId?: string
  checkinId?: string
  mergedNotes?: string | null
  draftContext?: {
    title?: string
    phase?: string | null
    workout_plan?: string | null
    nutrition_plan?: string | null
    cardio_plan?: string | null
    supplement_plan?: string | null
  }
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
  const checkinId = body.checkinId?.trim()
  if (!clientId || !checkinId) {
    return NextResponse.json({ error: 'clientId and checkinId are required' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', clientId)
    .eq('coach_id', coach.id)
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('id', checkinId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!checkin) {
    return NextResponse.json({ error: 'Check-in not found' }, { status: 404 })
  }

  const { data: activePlan } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = new Date().toISOString()
  const draftContext: Plan | null = body.draftContext
    ? {
        id: 'draft-context',
        client_id: clientId,
        coach_id: coach.id,
        title: body.draftContext.title ?? 'AI Draft',
        phase: body.draftContext.phase ?? null,
        workout_plan: body.draftContext.workout_plan ?? null,
        nutrition_plan: body.draftContext.nutrition_plan ?? null,
        cardio_plan: body.draftContext.cardio_plan ?? null,
        supplement_plan: body.draftContext.supplement_plan ?? null,
        coach_notes: body.mergedNotes ?? null,
        version: 0,
        active: false,
        delivered_at: null,
        created_at: now,
        updated_at: now,
      }
    : null

  const coachNotes = await ensureClientCoachMessage({
    profile: client as OnboardingProfile,
    checkin: checkin as Checkin,
    activePlan: (activePlan as Plan | null) ?? null,
    draftPlan: draftContext,
    mergedNotes: body.mergedNotes,
  })

  return NextResponse.json({ coachNotes })
}
