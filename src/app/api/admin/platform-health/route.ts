import { NextResponse } from 'next/server'
import { getPlatformHealth } from '@/lib/admin/platform-health'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  return NextResponse.json(getPlatformHealth())
}
