import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { getCoachWorkQueue } from '@/lib/coach-work-queue'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  // Resolve coach with the user-scoped client, then read queue with the service
  // role so RLS EXISTS subqueries cannot stall multi-minute on large tables.
  const { data: coach, error: coachError } = await auth.supabase
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError || !coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const tasks = await getCoachWorkQueue(admin, coach.id)
    return NextResponse.json({ tasks, coachId: coach.id })
  } catch (error) {
    console.error('[work-queue] failed to load queue', error)
    return NextResponse.json(
      { error: 'Work queue failed to load. Please retry.' },
      { status: 503 }
    )
  }
}
