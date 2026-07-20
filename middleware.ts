import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveProductionHostRedirect } from '@/lib/host-routing'
import { warnIfTestModeEnvInProduction } from '@/lib/test-mode'

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

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  )

  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
