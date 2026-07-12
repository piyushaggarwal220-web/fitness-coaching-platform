import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type ApiAuthResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }

/** Resolve the current user on API routes — mirrors client ensureAuthSession with refresh fallback. */
export async function requireApiUser(): Promise<ApiAuthResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (user && !error) {
    return { ok: true, supabase, user }
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshData?.user && !refreshError) {
    return { ok: true, supabase, user: refreshData.user }
  }

  const { data: { user: retryUser } } = await supabase.auth.getUser()
  if (retryUser) {
    return { ok: true, supabase, user: retryUser }
  }

  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    ),
  }
}
