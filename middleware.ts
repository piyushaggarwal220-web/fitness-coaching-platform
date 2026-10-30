import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveProductionHostRedirect } from '@/lib/host-routing'
import { warnIfTestModeEnvInProduction } from '@/lib/test-mode'

/** Stay under Vercel's middleware limit. A hung auth refresh becomes a 504 for every page. */
const AUTH_REFRESH_TIMEOUT_MS = 4000

function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTH_REFRESH_TIMEOUT_MS)
  if (init?.signal?.aborted) controller.abort()
  else init?.signal?.addEventListener('abort', () => controller.abort(), { once: true })
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function supabasePublicConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (url && anonKey) return { url, anonKey }
  return {
    url: 'https://placeholder.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.placeholder',
  }
}

export async function middleware(request: NextRequest) {
  warnIfTestModeEnvInProduction()

  const hostRedirect = resolveProductionHostRedirect(
    request.headers.get('host'),
    request.nextUrl.pathname,
    request.nextUrl.search
  )
  if (hostRedirect) {
    return NextResponse.redirect(hostRedirect, 308)
  }

  const pathname = request.nextUrl.pathname
  // Razorpay has no session. A Supabase auth 504 here drops paid webhooks
  // and can block create-order / verify while Auth is down.
  if (shouldSkipAuthRefresh(pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })
  const { url, anonKey } = supabasePublicConfig()

  const supabase = createServerClient(url, anonKey, {
    global: { fetch: fetchWithDeadline },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  try {
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((resolve) => setTimeout(resolve, AUTH_REFRESH_TIMEOUT_MS + 250)),
    ])
  } catch {
    // Keep the request alive. Auth outages must not fail checkout or webhooks.
  }

  return supabaseResponse
}

function shouldSkipAuthRefresh(pathname: string): boolean {
  if (
    pathname === '/api/payment/webhook' ||
    pathname === '/api/payment/create-order' ||
    pathname === '/api/payment/verify' ||
    pathname === '/api/payment/razorpay-callback' ||
    pathname === '/api/payment/resume'
  ) {
    return true
  }
  // Public marketing pages, including the Shopify iframe of /preview4.
  if (/^\/preview\d+(?:\/|$)/.test(pathname)) return true
  // Auth cannot reach its own database right now. A getUser() on every page
  // and prefetch keeps those lookups piled up, so signed-in people stay stuck.
  return true
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|notification-sw.js|manifest.webmanifest|manifest.json|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
