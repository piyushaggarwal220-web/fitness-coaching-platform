import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  FITBIT_ACCESS_COOKIE,
  FITBIT_REFRESH_COOKIE,
  FITBIT_STATE_COOKIE,
  exchangeFitbitCode,
  fitbitConfigured,
  fitbitCookieOptions,
} from '@/lib/wearables/fitbit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = url.origin
  const redirect = (reason: string) =>
    NextResponse.redirect(new URL(`/tracker?fitbit=${encodeURIComponent(reason)}`, origin))

  if (!fitbitConfigured()) return redirect('not_configured')

  const error = url.searchParams.get('error')
  if (error) return redirect('denied')

  const code = url.searchParams.get('code')?.trim()
  const state = url.searchParams.get('state')?.trim()
  if (!code || !state) return redirect('missing_code')

  const store = await cookies()
  const expected = store.get(FITBIT_STATE_COOKIE)?.value
  if (!expected || expected !== state) return redirect('bad_state')

  try {
    const tokens = await exchangeFitbitCode(code)
    const res = redirect('connected')
    res.cookies.set(FITBIT_STATE_COOKIE, '', { ...fitbitCookieOptions(0), maxAge: 0 })
    if (tokens.access_token) {
      res.cookies.set(
        FITBIT_ACCESS_COOKIE,
        tokens.access_token,
        fitbitCookieOptions(tokens.expires_in ?? 28800)
      )
    }
    if (tokens.refresh_token) {
      res.cookies.set(FITBIT_REFRESH_COOKIE, tokens.refresh_token, fitbitCookieOptions(60 * 60 * 24 * 30))
    }
    return res
  } catch {
    return redirect('token_failed')
  }
}
