import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureWeeklyCallForClient } from '@/lib/weekly-call-schedule'

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { clientId?: string } | null
  const clientId = body?.clientId?.trim()
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }

  const { data: coach } = await auth.supabase
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  const { data: client } = await auth.supabase
    .from('profiles')
    .select('id, coach_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!client || client.coach_id !== coach.id) {
    return NextResponse.json({ error: 'Client not on your roster' }, { status: 404 })
  }

  const admin = createAdminClient()
  const result = await ensureWeeklyCallForClient(admin, clientId, { actorUserId: auth.user.id })
  return NextResponse.json(result)
}
