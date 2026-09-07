import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { PUBLIC_DEMO_CLIENT_EMAIL } from '@/lib/public-demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function applyAuthCookie(
  response: NextResponse,
  name: string,
  value: string,
  options: Record<string, unknown>
): void {
  const sameSite = options.sameSite
  response.cookies.set(name, value, {
    path: typeof options.path === 'string' ? options.path : '/',
    maxAge: typeof options.maxAge === 'number' ? options.maxAge : undefined,
    domain: typeof options.domain === 'string' ? options.domain : undefined,
    secure: options.secure === true,
    httpOnly: options.httpOnly === true,
    sameSite:
      sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none' ? sameSite : 'lax',
  })
}

/**
 * One-click sign-in for the public view-only demo client.
 * Password stays on the server — never sent to the storefront.
 */
export async function POST() {
  const password = process.env.PUBLIC_DEMO_CLIENT_PASSWORD?.trim()
  if (!password) {
    return NextResponse.json(
      {
        error: 'Demo login is not configured yet.',
        code: 'demo_not_configured',
      },
      { status: 503 }
    )
  }

  const cookieStore = await cookies()
  const { url, anonKey } = supabasePublicConfig()
  const pendingCookies: Array<{
    name: string
    value: string
    options: Record<string, unknown>
  }> = []

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          pendingCookies.push({
            name: cookie.name,
            value: cookie.value,
            options: { ...(cookie.options as Record<string, unknown> | undefined) },
          })
        }
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({
    email: PUBLIC_DEMO_CLIENT_EMAIL,
    password,
  })

  if (error || !data.user || !data.session) {
    return NextResponse.json(
      {
        error: 'Demo account is unavailable right now. Try again in a minute.',
        code: 'demo_login_failed',
      },
      { status: 503 }
    )
  }

  if (data.user.email?.trim().toLowerCase() !== PUBLIC_DEMO_CLIENT_EMAIL) {
    return NextResponse.json(
      { error: 'Demo login refused.', code: 'demo_login_refused' },
      { status: 403 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle()

  const response = NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    profile: profile ?? null,
  })
  for (const { name, value, options } of pendingCookies) {
    applyAuthCookie(response, name, value, options)
  }
  return response
}
