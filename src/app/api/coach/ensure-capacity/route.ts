import { NextResponse } from 'next/server'
import { raiseCoachHardCapsBelowTarget, resolveCoachHardCap } from '@/lib/coach-capacity'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, hard_cap')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!coach?.id) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const result = await raiseCoachHardCapsBelowTarget(admin)

  const { data: refreshed } = await admin
    .from('coaches')
    .select('id, hard_cap')
    .eq('id', coach.id)
    .maybeSingle()

  return NextResponse.json({
    ...result,
    hardCap: resolveCoachHardCap(refreshed?.hard_cap ?? result.hardCap),
  })
}
