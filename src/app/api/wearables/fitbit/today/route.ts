import { NextResponse } from 'next/server'
import { requireEntitledClientApiUser } from '@/lib/client-entitlement-guard'
import {
  FITBIT_ACCESS_COOKIE,
  FITBIT_REFRESH_COOKIE,
  fetchFitbitToday,
  fitbitConfigured,
  fitbitCookieOptions,
  readFitbitCookies,
  refreshFitbitToken,
} from '@/lib/wearables/fitbit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const auth = await requireEntitledClientApiUser()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Authentication required' }, { status: auth.response.status })
  }
  if (!fitbitConfigured()) {
    return NextResponse.json({ error: 'Fitbit is not configured', needsConnect: false }, { status: 400 })
  }

  const date = new URL(request.url).searchParams.get('date')?.trim() ?? ''
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 })
  }

  const tokens = await readFitbitCookies()
  if (!tokens.access && !tokens.refresh) {
    return NextResponse.json({ error: 'Connect Fitbit first', needsConnect: true }, { status: 401 })
  }

  const applyTokens = (res: NextResponse, access: string, refresh: string | null, expiresIn?: number) => {
    res.cookies.set(FITBIT_ACCESS_COOKIE, access, fitbitCookieOptions(expiresIn ?? 28800))
    if (refresh) {
      res.cookies.set(FITBIT_REFRESH_COOKIE, refresh, fitbitCookieOptions(60 * 60 * 24 * 30))
    }
  }

  const load = async (access: string) => fetchFitbitToday(access, date)

  try {
    if (tokens.access) {
      try {
        const data = await load(tokens.access)
        return NextResponse.json(data)
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'unauthorized' || !tokens.refresh) throw err
      }
    }

    if (!tokens.refresh) {
      return NextResponse.json({ error: 'Connect Fitbit first', needsConnect: true }, { status: 401 })
    }

    const refreshed = await refreshFitbitToken(tokens.refresh)
    if (!refreshed.access_token) {
      return NextResponse.json({ error: 'Connect Fitbit first', needsConnect: true }, { status: 401 })
    }
    const data = await load(refreshed.access_token)
    const res = NextResponse.json(data)
    applyTokens(res, refreshed.access_token, refreshed.refresh_token ?? tokens.refresh, refreshed.expires_in)
    return res
  } catch {
    return NextResponse.json(
      { error: 'Could not read Fitbit today. Try connecting again.', needsConnect: true },
      { status: 502 }
    )
  }
}
