import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-navigation'

/**
 * Supabase email links (password recovery, magic link) land here with ?code=.
 * Exchange the code for a session, then send the user to `next`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeInternalPath(url.searchParams.get('next'), '/reset-password')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const login = new URL('/login', url.origin)
      login.searchParams.set('error', 'auth_callback')
      return NextResponse.redirect(login)
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
