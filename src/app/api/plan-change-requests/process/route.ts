import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { processPlanChangeRequest } from '@/lib/plan-change-requests'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

/** Generate the coach-review draft for a locked client plan-change request. */
export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => null)) as { requestId?: string } | null
  const requestId = body?.requestId?.trim()
  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('plan_change_requests')
    .select('id, client_id, status')
    .eq('id', requestId)
    .maybeSingle()

  if (!row || row.client_id !== auth.user.id) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  }

  if (row.status !== 'generating') {
    return NextResponse.json({ ok: true, skipped: true, status: row.status })
  }

  await processPlanChangeRequest(requestId)
  return NextResponse.json({ ok: true })
}
