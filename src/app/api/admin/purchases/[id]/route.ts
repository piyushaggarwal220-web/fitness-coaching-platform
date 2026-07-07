import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import type { PurchaseDetail } from '@/types/database'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: purchase, error } = await admin
    .from('purchases')
    .select('*, profiles:user_id(id, name, email, coach_id, onboarding_complete, plan_delivered)')
    .eq('id', id)
    .maybeSingle()

  if (error || !purchase) {
    return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
  }

  const clientId = purchase.user_id
  let coach = null
  let plans: PurchaseDetail['plans'] = []
  let support_requests: PurchaseDetail['support_requests'] = []
  let checkins: PurchaseDetail['checkins'] = []

  if (clientId) {
    const profileRow = purchase.profiles as { coach_id?: string | null } | null
    if (profileRow?.coach_id) {
      const { data: coachData } = await admin
        .from('coaches')
        .select('id, name')
        .eq('id', profileRow.coach_id)
        .maybeSingle()
      coach = coachData
    }

    const [plansRes, supportRes, checkinsRes] = await Promise.all([
      admin.from('plans').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      admin.from('support_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      admin.from('checkins').select('*').eq('client_id', clientId).order('submitted_at', { ascending: false }),
    ])

    plans = (plansRes.data ?? []) as PurchaseDetail['plans']
    support_requests = (supportRes.data ?? []) as PurchaseDetail['support_requests']
    checkins = (checkinsRes.data ?? []) as PurchaseDetail['checkins']
  }

  const detail: PurchaseDetail = {
    ...(purchase as PurchaseDetail),
    coach,
    plans,
    support_requests,
    checkins,
  }

  return NextResponse.json({ purchase: detail })
}
