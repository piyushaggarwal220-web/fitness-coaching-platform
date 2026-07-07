import { NextResponse } from 'next/server'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

export type AdminApiProfile = Pick<Profile, 'id' | 'name' | 'email' | 'role'>

export type AdminApiAuthResult =
  | { ok: true; userId: string; profile: AdminApiProfile }
  | { ok: false; response: NextResponse }

/** Validate the current session is an admin or super_admin (for API routes). */
export async function requireAdminApi(): Promise<AdminApiAuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 }),
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !isAdminRole(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 }),
    }
  }

  return { ok: true, userId: user.id, profile: profile as AdminApiProfile }
}
