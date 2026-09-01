export type AuthLoginResult = {
  user?: { id: string; email?: string | null }
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
    const data = (await res.json().catch(() => null)) as {
      user?: { id: string; email?: string | null }
      error?: string
      code?: string
    } | null
    if (!res.ok) {
      return {
        error: data?.error ?? 'Unable to sign in. Check your email and password.',
        code: data?.code,
      }
    }
    if (!data?.user?.id) {
      return { error: 'Login failed. Please try again.' }
    }
    return { user: data.user, code: data?.code }
  } catch {
    return {
      error:
        'Could not reach the login server. Check your internet connection, try Wi‑Fi, or retry in a minute.',
      code: 'network_error',
    }
  }
}
