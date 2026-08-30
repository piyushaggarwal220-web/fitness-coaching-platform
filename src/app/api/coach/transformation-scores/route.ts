import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { loadTransformationScores } from '@/lib/transformation-scores'
import { createAdminClient } from '@/lib/supabase/admin'

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

  try {
    const admin = createAdminClient()
    const scores = await loadTransformationScores({ coachId: coach.id })
    return NextResponse.json({ scores, coachId: coach.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load scores' },
      { status: 500 }
    )
  }
}
