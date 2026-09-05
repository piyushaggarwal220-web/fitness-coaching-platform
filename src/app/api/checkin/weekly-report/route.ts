import { NextResponse } from 'next/server'
import { requireEntitledClientApiUser } from '@/lib/client-entitlement-guard'
import { buildWeeklyCheckinWorkbook } from '@/lib/client-reports/deliver-weekly-workbook'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireEntitledClientApiUser()
  if (!auth.ok) return auth.response

  const checkinId = new URL(request.url).searchParams.get('checkinId')?.trim()
  if (!checkinId) {
    return NextResponse.json({ error: 'checkinId is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: checkin } = await admin
    .from('checkins')
    .select('id, client_id, coach_id, checkin_type')
    .eq('id', checkinId)
    .maybeSingle()

  if (!checkin || checkin.checkin_type !== 'weekly') {
    return NextResponse.json({ error: 'Weekly check-in not found.' }, { status: 404 })
  }

  const { data: actor } = await auth.supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle()

  const isClient = checkin.client_id === auth.user.id
  const isAdmin = actor?.role === 'admin' || actor?.role === 'super_admin'
  let isCoach = false
  if (actor?.role === 'coach') {
    const { data: coach } = await admin
      .from('coaches')
      .select('id')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    isCoach = coach?.id === checkin.coach_id
  }

  if (!isClient && !isCoach && !isAdmin) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
  }

  const built = await buildWeeklyCheckinWorkbook({
    clientId: checkin.client_id,
    checkinId: checkin.id,
  })
  if ('error' in built) {
    return NextResponse.json({ error: built.error }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(built.buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${built.filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
