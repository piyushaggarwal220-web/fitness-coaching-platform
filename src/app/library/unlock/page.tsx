'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Lock, Play, ShieldCheck } from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import { authStyles } from '@/lib/auth-styles'
import {
  CHECKOUT_ADDONS,
  EXERCISE_LIBRARY_ADDON_ID,
  EXERCISE_LIBRARY_ADDON_PAISE,
  formatInrFromPaise,
} from '@/lib/payments/checkout-discounts'
import { startExerciseLibraryCheckout } from '@/lib/payments/exercise-library-checkout-client'
import { createClient } from '@/lib/supabase/client'
import { colors, radius, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile } from '@/types/database'

const supabase = createClient()
const priceLabel = formatInrFromPaise(EXERCISE_LIBRARY_ADDON_PAISE)
const productCopy =
  CHECKOUT_ADDONS.find((item) => item.id === EXERCISE_LIBRARY_ADDON_ID)?.copy ??
  'Form videos for every lift in your workout tracker.'

/**
 * Browser checkout for the exercise form video library.
 * Shareable at /library/unlock — opens Razorpay in the user's browser.
 */
export default function ExerciseLibraryUnlockPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justUnlocked, setJustUnlocked] = useState(false)
  const [razorpayReady, setRazorpayReady] = useState(false)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent('/library/unlock')}`)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, payment_confirmed, exercise_library_entitled, role')
        .eq('id', user.id)
        .maybeSingle()

      const row = data as OnboardingProfile | null
      if (row?.role === 'coach') {
        router.replace('/coach/dashboard')
        return
      }
      if (row?.role === 'admin' || row?.role === 'super_admin') {
        router.replace('/admin/dashboard')
        return
      }

      setProfile(row)
      setLoading(false)
    }
    void load()
  }, [router])

  const entitled =
    justUnlocked || profileEntitledForExerciseLibrary(profile)

  const handlePay = async () => {
    setError(null)
    setPaying(true)
    try {
      const result = await startExerciseLibraryCheckout()
      if (result.status === 'success' || result.status === 'already_unlocked') {
        setJustUnlocked(true)
        return
      }
      if (result.status === 'cancelled') return
      setError(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <div style={authStyles.page}>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 15 }}>Loading…</p>
      </div>
    )
  }

  if (!profile?.payment_confirmed) {
    return (
      <div style={authStyles.page}>
        <div style={authStyles.card}>
          <p style={authStyles.logo}>{BRAND_NAME}</p>
          <h1 style={{ ...authStyles.title, fontSize: 22 }}>Coaching plan required</h1>
          <p style={{ margin: `0 0 ${spacing[4]}px`, fontSize: 15, lineHeight: 1.5, color: colors.textSecondary }}>
            Exercise form videos unlock after you start a coaching plan. Choose a plan, pay in your browser, then
            return here to unlock the full library.
          </p>
          <Link
            href="/checkout?plan=3_months"
            style={{
              ...authStyles.button,
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            View coaching plans
          </Link>
        </div>
      </div>
    )
  }

  if (entitled) {
    return (
      <div style={authStyles.page}>
        <div style={authStyles.card}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing[3] }}>
            <CheckCircle2 size={40} color={colors.success} />
          </div>
          <h1 style={{ ...authStyles.title, fontSize: 22 }}>Library unlocked</h1>
          <p style={{ margin: `0 0 ${spacing[4]}px`, fontSize: 15, lineHeight: 1.5, color: colors.textSecondary, textAlign: 'center' }}>
            Every form video in your workout tracker is available. Open the tracker and tap any exercise name.
          </p>
          <Link
            href="/tracker/workout"
            style={{
              ...authStyles.button,
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Go to workout tracker
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={authStyles.page}>
        <div style={{ ...authStyles.card, maxWidth: 440 }}>
          <p style={authStyles.logo}>{BRAND_NAME}</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing[3] }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.full,
                background: `${colors.accent}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play size={28} color={colors.accent} />
            </div>
          </div>
          <h1 style={{ ...authStyles.title, fontSize: 22 }}>Exercise form videos</h1>
          <p style={{ margin: `0 0 ${spacing[3]}px`, fontSize: 15, lineHeight: 1.55, color: colors.textSecondary, textAlign: 'center' }}>
            {productCopy}
          </p>

          <ul
            style={{
              margin: `0 0 ${spacing[4]}px`,
              padding: `${spacing[3]}px ${spacing[4]}px`,
              listStyle: 'none',
              background: colors.bgElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.borderSubtle}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <li style={{ display: 'flex', gap: 10, fontSize: 14, color: colors.textSecondary }}>
              <Lock size={16} color={colors.accent} style={{ flexShrink: 0, marginTop: 2 }} />
              One-time {priceLabel} — unlocks every lift in your tracker
            </li>
            <li style={{ display: 'flex', gap: 10, fontSize: 14, color: colors.textSecondary }}>
              <ShieldCheck size={16} color={colors.accent} style={{ flexShrink: 0, marginTop: 2 }} />
              Pay securely in your browser via UPI, card, or netbanking
            </li>
          </ul>

          <p
            style={{
              margin: `0 0 ${spacing[3]}px`,
              textAlign: 'center',
              fontSize: 28,
              fontWeight: 800,
              color: colors.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            {priceLabel}
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.textMuted }}> one-time</span>
          </p>

          {error ? (
            <p style={{ margin: `0 0 ${spacing[3]}px`, color: colors.danger, fontSize: 14, textAlign: 'center' }}>
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={paying || !razorpayReady}
            style={{
              ...authStyles.button,
              opacity: paying || !razorpayReady ? 0.7 : 1,
              cursor: paying || !razorpayReady ? 'wait' : 'pointer',
            }}
          >
            {paying ? 'Opening checkout…' : !razorpayReady ? 'Loading checkout…' : `Pay ${priceLabel} in browser`}
          </button>

          <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 1.45 }}>
            You get 3 free form videos without paying. This unlocks the rest permanently.
          </p>

          <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 13, textAlign: 'center' }}>
            <Link href="/tracker/workout" style={{ color: colors.accent, textDecoration: 'none', fontWeight: 600 }}>
              Back to workout tracker
            </Link>
          </p>
        </div>
      </div>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setRazorpayReady(true)}
      />
    </>
  )
}
