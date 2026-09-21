import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminRole } from '@/lib/roles'
import type { User } from '@supabase/supabase-js'

export type AdminApiAuth =
  | { ok: true; user: User; role: string }
  | { ok: false; response: NextResponse }

export async function requireMarketingAdmin(): Promise<AdminApiAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      ),
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !isAdminRole(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      ),
    }
  }

  return { ok: true, user, role: profile.role }
}

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production'
  }
  return request.headers.get('authorization') === `Bearer ${secret}`
}
