import { NextResponse, type NextRequest } from 'next/server'
import { injectPreview7Tracking, preview7PixelId } from '@/lib/landing/preview7-tracking'
import { preview7LiveHtml } from '@/lib/landing/preview7-html'

export const dynamic = 'force-dynamic'

const THEME_HOME = 'https://www.lurvox.in/'
const META_COOKIE_MAX_AGE_SEC = 90 * 24 * 60 * 60

let cachedHome: { at: number; html: string } | null = null

/**
 * ABO sales opens this URL. It has to stay on the app and fire the app pixel,
 * the same way preview 4, 5, and 6 do. A redirect to the shop never records a view.
 * The page is the live lurvox.in homepage, plus the app pixel.
 */
export async function GET(request: NextRequest) {
  const rendered = await renderPreview(request)
  stampMetaCookies(rendered, request)
  return rendered
}

async function renderPreview(request: NextRequest) {
  const now = Date.now()
  if (!cachedHome || now - cachedHome.at > 60_000) {
    try {
      const live = await fetch(THEME_HOME, { headers: { 'User-Agent': 'LURVOX preview7' }, cache: 'no-store' })
      if (!live.ok) throw new Error(`storefront ${live.status}`)
      cachedHome = { at: now, html: await live.text() }
    } catch {
      if (!cachedHome) return redirectHome(request)
    }
  }
  if (!cachedHome) return redirectHome(request)

  const html = injectPreview7Tracking(preview7LiveHtml(cachedHome.html), {
    pixelId: preview7PixelId(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function redirectHome(request: NextRequest) {
  const destination = new URL(THEME_HOME)
  request.nextUrl.searchParams.forEach((value, key) => {
    destination.searchParams.append(key, value)
  })
  return NextResponse.redirect(destination, 307)
}

function stampMetaCookies(response: NextResponse, request: NextRequest) {
  const fbclid = request.nextUrl.searchParams.get('fbclid')?.trim()
  const fbp = request.nextUrl.searchParams.get('fbp')?.trim()
  const fbc = request.nextUrl.searchParams.get('fbc')?.trim()
  if (fbp?.startsWith('fb.')) setMetaCookie(response, '_fbp', fbp)
  if (fbc?.startsWith('fb.')) setMetaCookie(response, '_fbc', fbc)
  else if (fbclid) setMetaCookie(response, '_fbc', `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`)
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
