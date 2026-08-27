import 'server-only'

import { cookies } from 'next/headers'
import { resolveAppBaseUrl } from '@/lib/admin/portal-urls'

export const FITBIT_STATE_COOKIE = 'lx_fitbit_state'
export const FITBIT_ACCESS_COOKIE = 'lx_fitbit_at'
export const FITBIT_REFRESH_COOKIE = 'lx_fitbit_rt'

const FITBIT_AUTHORIZE = 'https://www.fitbit.com/oauth2/authorize'
const FITBIT_TOKEN = 'https://api.fitbit.com/oauth2/token'
const FITBIT_API = 'https://api.fitbit.com'

export function fitbitConfigured(): boolean {
  return Boolean(
    process.env.FITBIT_CLIENT_ID?.trim() && process.env.FITBIT_CLIENT_SECRET?.trim()
  )
}

export function fitbitRedirectUri(): string {
  return `${resolveAppBaseUrl()}/api/wearables/fitbit/callback`
}

function basicAuth(): string {
  const id = process.env.FITBIT_CLIENT_ID?.trim() ?? ''
  const secret = process.env.FITBIT_CLIENT_SECRET?.trim() ?? ''
  return Buffer.from(`${id}:${secret}`).toString('base64')
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function fitbitCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: cookieSecure(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export function fitbitAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.FITBIT_CLIENT_ID?.trim() ?? '',
    redirect_uri: fitbitRedirectUri(),
    scope: 'activity sleep',
    expires_in: '604800',
    state,
  })
  return `${FITBIT_AUTHORIZE}?${params.toString()}`
}

type TokenPayload = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  errors?: { errorType?: string; message?: string }[]
}

async function parseTokenResponse(res: Response): Promise<TokenPayload> {
  return (await res.json().catch(() => ({}))) as TokenPayload
}

export async function exchangeFitbitCode(code: string): Promise<TokenPayload> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: fitbitRedirectUri(),
  })
  const res = await fetch(FITBIT_TOKEN, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })
  const payload = await parseTokenResponse(res)
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.errors?.[0]?.message || 'Fitbit token exchange failed')
  }
  return payload
}

export async function refreshFitbitToken(refreshToken: string): Promise<TokenPayload> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(FITBIT_TOKEN, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  })
  const payload = await parseTokenResponse(res)
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.errors?.[0]?.message || 'Fitbit refresh failed')
  }
  return payload
}

export async function readFitbitCookies() {
  const store = await cookies()
  return {
    access: store.get(FITBIT_ACCESS_COOKIE)?.value ?? null,
    refresh: store.get(FITBIT_REFRESH_COOKIE)?.value ?? null,
  }
}

export type FitbitToday = {
  steps: number | null
  sleepHours: number | null
}

export async function fetchFitbitToday(accessToken: string, date: string): Promise<FitbitToday> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const [activityRes, sleepRes] = await Promise.all([
    fetch(`${FITBIT_API}/1/user/-/activities/date/${date}.json`, { headers, cache: 'no-store' }),
    fetch(`${FITBIT_API}/1.2/user/-/sleep/date/${date}.json`, { headers, cache: 'no-store' }),
  ])

  const activity = (await activityRes.json().catch(() => null)) as {
    summary?: { steps?: number }
    errors?: unknown
  } | null
  const sleep = (await sleepRes.json().catch(() => null)) as {
    summary?: { totalMinutesAsleep?: number }
    errors?: unknown
  } | null

  if (activityRes.status === 401 || sleepRes.status === 401) {
    throw new Error('unauthorized')
  }

  const steps = activity?.summary?.steps
  const minutes = sleep?.summary?.totalMinutesAsleep
  return {
    steps: typeof steps === 'number' && Number.isFinite(steps) ? steps : null,
    sleepHours:
      typeof minutes === 'number' && Number.isFinite(minutes)
        ? Math.round((minutes / 60) * 10) / 10
        : null,
  }
}
