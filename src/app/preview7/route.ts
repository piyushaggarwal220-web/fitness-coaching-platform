import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const THEME_HOME = 'https://www.lurvox.in/'
const META_COOKIE_MAX_AGE_SEC = 90 * 24 * 60 * 60

/**
 * Public entry for Shopify theme "Live quiz-v3 2026-08-26 18:09".
 * The storefront is that theme. This path keeps the ad URL and forwards click ids.
 */
export function GET(request: NextRequest) {
  const destination = new URL(THEME_HOME)
  request.nextUrl.searchParams.forEach((value, key) => {
    destination.searchParams.append(key, value)
  })

  const response = NextResponse.redirect(destination, 307)
  const fbclid = request.nextUrl.searchParams.get('fbclid')?.trim()
  const fbp = request.nextUrl.searchParams.get('fbp')?.trim()
  const fbc = request.nextUrl.searchParams.get('fbc')?.trim()
  if (fbp?.startsWith('fb.')) setMetaCookie(response, '_fbp', fbp)
  if (fbc?.startsWith('fb.')) setMetaCookie(response, '_fbc', fbc)
  else if (fbclid) setMetaCookie(response, '_fbc', `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`)
  return response
}

function setMetaCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set(name, value, {
    domain: '.lurvox.in',
    path: '/',
    maxAge: META_COOKIE_MAX_AGE_SEC,
    sameSite: 'lax',
    secure: true,
  })
}
