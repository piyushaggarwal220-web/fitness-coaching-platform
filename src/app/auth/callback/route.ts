import { NextResponse } from 'next/server'
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_COOKIE_MAX_AGE_SEC,
} from '@/lib/auth-password-reset'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-navigation'

const OTP_TYPES = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

/**
 * Auth email landing:
 * - PKCE `?code=` (legacy Supabase emails)
 * - Cross-device `?token_hash=&type=recovery` (our forgot-password emails)
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const typeParam = url.searchParams.get('type')
  const next = safeInternalPath(url.searchParams.get('next'), '/reset-password')
  const isPasswordRecovery =
    next === '/reset-password' ||
    next.startsWith('/reset-password?') ||
    typeParam === 'recovery'

  const failToForgot = (reason: string) => {
    const dest = new URL('/forgot-password', url.origin)
    dest.searchParams.set('error', reason)
    return NextResponse.redirect(dest)
  }

  const supabase = await createClient()
  let established = false

  if (tokenHash && typeParam) {
    if (!OTP_TYPES.has(typeParam)) {
      return failToForgot('link_expired')
    }
    const { error } = await supabase.auth.verifyOtp({
      // Supabase EmailOtpType — recovery is the forgot-password path.
      type: typeParam as 'recovery',
      token_hash: tokenHash,
    })
    if (error) {
      console.warn('[auth/callback] verifyOtp failed:', error.message)
      return failToForgot('link_expired')
    }
    established = true
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.warn('[auth/callback] exchangeCode failed:', error.message)
      // Common when the email was opened on a different device than the request.
      return failToForgot('open_same_device')
    }
    established = true
  }

  if (!established && isPasswordRecovery) {
    // Landed without tokens — send them to request a fresh link.
    return failToForgot('link_missing')
  }

  const response = NextResponse.redirect(new URL(next, url.origin))
  if (isPasswordRecovery && established) {
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
