import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sanitizeAuthPasswordError } from '@/lib/auth-password-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  email?: string
  password?: string
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

/**
 * Same-origin login fallback when the browser cannot reach Supabase Auth directly
 * (common on some mobile networks — surfaces as "Failed to fetch").
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !email.includes('@') || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
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
        pendingCookies.push(...cookiesToSet)
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    const raw = error?.message ?? ''
    const looksInvalid = /invalid login credentials|invalid_credentials|email not confirmed/i.test(raw)
    if (looksInvalid) {
      return NextResponse.json(
        {
          error:
            'Email or password is incorrect. If you just paid, use the password you set on Create account — or reset it below.',
          code: 'invalid_credentials',
        },
        { status: 401 }
      )
    }
    const safe = sanitizeAuthPasswordError(raw)
    return NextResponse.json(
      {
        error: safe ?? 'Unable to sign in. Check your email and password.',
        code: 'auth_error',
      },
      { status: 401 }
    )
  }

  const response = NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
  })
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options)
  }
  return response
}
