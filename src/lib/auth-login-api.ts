import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingProfile } from '@/types/database'

export type AuthSessionTokens = {
  access_token: string
  refresh_token: string
}

export type AuthLoginResult = {
  user?: { id: string; email?: string | null }
  session?: AuthSessionTokens | null
  profile?: OnboardingProfile | null
  error?: string
  code?: string
}

/** Sign in through app.lurvox.in so mobile networks that block Supabase still work. */
export async function signInViaApi(email: string, password: string): Promise<AuthLoginResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    })
    const data = (await res.json().catch(() => null)) as AuthLoginResult | null
    if (!res.ok) {
      return {
        error: data?.error ?? 'Unable to sign in. Check your email and password.',
        code: data?.code,
      }
    }
    if (!data?.user?.id) {
      return { error: 'Login failed. Please try again.' }
    }
    return {
      user: data.user,
      session: data.session ?? null,
      profile: data.profile ?? null,
      code: data.code,
    }
  } catch {
    return {
      error:
        'Could not reach the login server. Check your internet connection, try Wi‑Fi, or retry in a minute.',
      code: 'network_error',
    }
  }
}

/** Copy server-issued tokens into the browser client so the next page is actually signed in. */
export async function hydrateBrowserAuthSession(
  supabase: SupabaseClient,
  session?: AuthSessionTokens | null
): Promise<void> {
  if (session?.access_token && session.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    if (!error) return
  }
  await supabase.auth.getSession()
}
