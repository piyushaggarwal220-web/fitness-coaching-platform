import { NextResponse } from 'next/server'
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_COOKIE_MAX_AGE_SEC,
} from '@/lib/auth-password-reset'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Marks the browser for password recovery when the client receives
 * PASSWORD_RECOVERY (hash-based email links that skip /auth/callback).
 * Only succeeds for an authenticated session created in the last hour.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json({ error: 'Not signed in.', code: 'session_missing' }, { status: 401 })
  }

  const issuedAtSec = (() => {
    try {
      const payload = session.access_token.split('.')[1]
      if (!payload) return null
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
      const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
        iat?: number
      }
      return typeof json.iat === 'number' ? json.iat : null
    } catch {
      return null
    }
  })()

  const nowSec = Math.floor(Date.now() / 1000)
  if (issuedAtSec == null || nowSec - issuedAtSec > 60 * 60) {
    return NextResponse.json(
      {
        error: 'This reset session is too old. Request a new reset link.',
        code: 'session_stale',
      },
      { status: 403 }
    )
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(request.url).protocol === 'https:',
    path: '/',
    maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE_SEC,
  })
  return response
}
