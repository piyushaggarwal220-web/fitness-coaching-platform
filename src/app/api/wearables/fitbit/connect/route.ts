import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireEntitledClientApiUser } from '@/lib/client-entitlement-guard'
import {
  FITBIT_STATE_COOKIE,
  fitbitAuthorizeUrl,
  fitbitConfigured,
  fitbitCookieOptions,
} from '@/lib/wearables/fitbit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireEntitledClientApiUser()
  const origin = new URL(request.url).origin
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/tracker?fitbit=${encodeURIComponent(reason)}`, origin))

  if (!auth.ok) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent('/tracker')}`, origin))
  }
  if (!fitbitConfigured()) {
    return fail('not_configured')
  }

  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(fitbitAuthorizeUrl(state))
  res.cookies.set(FITBIT_STATE_COOKIE, state, fitbitCookieOptions(600))
  return res
}
