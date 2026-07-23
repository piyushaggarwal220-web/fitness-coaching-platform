import { after, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  createLockedPlanChangeRequest,
  getPlanChangeQuota,
  processPlanChangeRequest,
  type PlanChangeScope,
} from '@/lib/plan-change-requests'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const quota = await getPlanChangeQuota(auth.user.id)
  return NextResponse.json({
    quota: {
      usedToday: quota.usedToday,
      usedThisMonth: quota.usedThisMonth,
      remainingToday: quota.remainingToday,
      remainingThisMonth: quota.remainingThisMonth,
      canSubmit: quota.canSubmit,
    },
    openRequest: quota.openRequest
      ? {
          id: quota.openRequest.id,
          status: quota.openRequest.status,
          scope: quota.openRequest.scope,
          lockedAt: quota.openRequest.locked_at,
          draftReadyAt: quota.openRequest.draft_ready_at,
          errorMessage: quota.openRequest.error_message,
        }
      : null,
  })
}

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as {
    requestText?: string
    scope?: string
  } | null

  const requestText = body?.requestText?.trim() ?? ''
  const scope = (body?.scope?.trim() ?? '') as PlanChangeScope
  if (!['diet', 'workout', 'both'].includes(scope)) {
    return NextResponse.json({ error: 'Choose diet, workout, or both.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, coach_id, plan_delivered, role')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile || (profile.role && profile.role !== 'client')) {
    return NextResponse.json({ error: 'Client profile required.' }, { status: 403 })
  }
  if (!profile.coach_id) {
    return NextResponse.json({ error: 'No coach assigned yet.' }, { status: 400 })
  }
  if (!profile.plan_delivered) {
    return NextResponse.json(
      { error: 'You can request edits after your coach delivers your first plan.' },
      { status: 400 }
    )
  }

  const { data: activePlan } = await admin
    .from('plans')
    .select('id')
    .eq('client_id', auth.user.id)
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!activePlan?.id) {
    return NextResponse.json({ error: 'No active plan found to edit.' }, { status: 400 })
  }

  const created = await createLockedPlanChangeRequest({
    clientId: auth.user.id,
    coachId: profile.coach_id,
    activePlanId: activePlan.id,
    requestText,
    scope,
  })

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status })
  }

  after(() =>
    processPlanChangeRequest(created.request.id).catch((err) => {
      console.error('[plan-change] background failed', err)
    })
  )

  return NextResponse.json({
    ok: true,
    request: {
      id: created.request.id,
      status: created.request.status,
      scope: created.request.scope,
      lockedAt: created.request.locked_at,
    },
    message:
      'Your changes are locked in. Your coach will review your request shortly. Updated plans are not live until your coach sends them.',
  })
}
