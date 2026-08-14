import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { getCoachWorkQueue } from '@/lib/coach-work-queue'

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { data: coach, error: coachError } = await auth.supabase
    .from('coaches')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (coachError || !coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  const tasks = await getCoachWorkQueue(auth.supabase, coach.id)
  return NextResponse.json({ tasks, coachId: coach.id })
}
