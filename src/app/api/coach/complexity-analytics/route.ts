import { NextResponse } from 'next/server'
import { getComplexityAnalytics } from '@/lib/complexity/analytics'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
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

  const analytics = await getComplexityAnalytics(coach.id)
  return NextResponse.json(analytics)
}
