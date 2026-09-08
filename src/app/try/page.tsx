'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BRAND_NAME, brandTitle } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { hydrateBrowserAuthSession } from '@/lib/auth-login-api'
import { fetchClientProfile, getClientPostAuthPath, isOnboardingComplete } from '@/lib/onboarding'
import { markDemoTourOffer } from '@/lib/demo-tour'
import { PUBLIC_DEMO_READ_ONLY_MESSAGE } from '@/lib/public-demo'
import type { AuthLoginResult } from '@/lib/auth-login-api'

const supabase = createClient()

async function signInPublicDemo(): Promise<AuthLoginResult> {
  try {
    const res = await fetch('/api/auth/demo-login', {
      method: 'POST',
      credentials: 'include',
    })
    const data = (await res.json().catch(() => null)) as AuthLoginResult | null
    if (!res.ok) {
      return {
        error: data?.error ?? 'Demo login is unavailable right now.',
        code: data?.code,
      }
    }
    if (!data?.user?.id) {
      return { error: 'Demo login failed. Please try again.' }
    }
    return {
      user: data.user,
      session: data.session ?? null,
      profile: data.profile ?? null,
    }
  } catch {
    return {
      error: 'Could not reach the demo login. Check your connection and retry.',
      code: 'network_error',
    }
  }
}

export default function PublicDemoTryPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      markDemoTourOffer()
      const loginResult = await signInPublicDemo()
      if (cancelled) return

      if (!loginResult.user) {
        setError(loginResult.error ?? 'Demo login failed.')
        return
      }

      const { invalidateSessionCache, seedAuthenticatedClientSession } = await import(
        '@/lib/session-restore'
      )
      invalidateSessionCache()
      await hydrateBrowserAuthSession(supabase, loginResult.session)

      let profile = loginResult.profile ?? null
      if (!profile) {
        const fetched = await fetchClientProfile(supabase, loginResult.user.id)
        profile = fetched.profile
      }
      if (profile && isOnboardingComplete(profile)) {
        seedAuthenticatedClientSession(
          { id: loginResult.user.id, email: loginResult.user.email ?? undefined },
          profile
        )
      }

      router.refresh()
      router.replace(profile ? getClientPostAuthPath(profile) : '/dashboard')
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div style={authStyles.page}>
      <div style={authStyles.card}>
        <div style={authStyles.logo}>{BRAND_NAME}</div>
        <h1 style={authStyles.title}>{brandTitle('Opening demo')}</h1>
        {error ? (
          <>
            <div style={authStyles.error}>{error}</div>
            <p style={authStyles.link}>
              <Link href="/login" style={authStyles.linkColor}>
                Client login
              </Link>
            </p>
          </>
        ) : (
          <p style={{ ...authStyles.link, marginTop: 0 }}>{PUBLIC_DEMO_READ_ONLY_MESSAGE}</p>
        )}
      </div>
    </div>
  )
}
