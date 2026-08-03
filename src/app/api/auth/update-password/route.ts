import { NextResponse } from 'next/server'
import {
  PASSWORD_RECOVERY_COOKIE,
  isPasswordReauthError,
} from '@/lib/auth-password-reset'
import { isLeakedPasswordAuthError } from '@/lib/auth-password-errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  password?: string
  nonce?: string
}

/**
 * Completes password reset for a signed-in recovery session.
 *
 * Prefer admin update when the recovery cookie is present (fresh email link),
 * so Supabase "Secure password change" does not block clients with a second OTP.
 * Falls back to client-style updateUser(+nonce) guidance when needed.
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : ''

  if (password.length < 6) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters.' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      {
        error: 'This reset link is invalid or expired. Request a new one and open it on this device.',
        code: 'session_missing',
      },
      { status: 401 }
    )
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const hasRecoveryCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((part) => part === `${PASSWORD_RECOVERY_COOKIE}=1`)

  // Fresh recovery email link → set password with service role (no reauth nonce).
  if (hasRecoveryCookie) {
    try {
      const admin = createAdminClient()
      const { error: adminError } = await admin.auth.admin.updateUserById(user.id, { password })
      if (adminError) {
        if (isLeakedPasswordAuthError(adminError.message)) {
          return NextResponse.json(
            { error: 'Please choose a different password and try again.', code: 'weak_password' },
            { status: 422 }
          )
        }
        return NextResponse.json(
          { error: adminError.message || 'Could not update password.', code: 'update_failed' },
          { status: 422 }
        )
      }

      const response = NextResponse.json({ success: true, method: 'recovery' })
      response.cookies.set(PASSWORD_RECOVERY_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: new URL(request.url).protocol === 'https:',
        path: '/',
        maxAge: 0,
      })
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update password.'
      return NextResponse.json({ error: message, code: 'update_failed' }, { status: 500 })
    }
  }

  // No recovery cookie: try normal updateUser (works when session is recent).
  const { error: updateError } = await supabase.auth.updateUser(
    nonce ? { password, nonce } : { password }
  )

  if (!updateError) {
    return NextResponse.json({ success: true, method: 'session' })
  }

  if (isLeakedPasswordAuthError(updateError.message)) {
    return NextResponse.json(
      { error: 'Please choose a different password and try again.', code: 'weak_password' },
      { status: 422 }
    )
  }

  if (isPasswordReauthError(updateError.message)) {
    return NextResponse.json(
      {
        error:
          'For security, we need a verification code from your email before saving the new password.',
        code: 'reauthentication_required',
      },
      { status: 403 }
    )
  }

  return NextResponse.json(
    { error: updateError.message || 'Could not update password.', code: 'update_failed' },
    { status: 422 }
  )
}
