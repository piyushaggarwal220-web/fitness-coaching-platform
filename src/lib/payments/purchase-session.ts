import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'

const SIGN_IN_RETRY_DELAYS_MS = [0, 400, 800]

export async function establishPurchaseSession(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase()
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  logPurchaseStep('automatic_sign_in_started', { email: normalizedEmail })

  let lastError = 'Sign-in failed'

  for (let attempt = 0; attempt < SIGN_IN_RETRY_DELAYS_MS.length; attempt++) {
    if (SIGN_IN_RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, SIGN_IN_RETRY_DELAYS_MS[attempt]))
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (!error) {
      logPurchaseStep('automatic_sign_in_succeeded', {
        email: normalizedEmail,
        attempt: attempt + 1,
      })
      return { ok: true }
    }

    lastError = error.message
    logPurchaseStep('automatic_sign_in_failed', {
      email: normalizedEmail,
      attempt: attempt + 1,
      error: error.message,
    })
  }

  return { ok: false, error: lastError }
}
