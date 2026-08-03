import { NextResponse } from 'next/server'
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_COOKIE_MAX_AGE_SEC,
} from '@/lib/auth-password-reset'
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
  const isPasswordRecovery = next === '/reset-password' || next.startsWith('/reset-password?')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const login = new URL('/login', url.origin)
      login.searchParams.set('error', 'auth_callback')
      return NextResponse.redirect(login)
    }
  }

  const response = NextResponse.redirect(new URL(next, url.origin))
  if (isPasswordRecovery && code) {
    // Marks this browser as having just opened a valid reset email link.
    // Used by /api/auth/update-password to bypass Secure password change reauth.
    response.cookies.set(PASSWORD_RECOVERY_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      path: '/',
      maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE_SEC,
    })
  }
  return response
}
