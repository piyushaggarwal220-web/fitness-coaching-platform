'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Lock, Play, ShieldCheck } from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { EXERCISE_VIDEOS_MONTHLY_PAISE, formatInrFromPaise } from '@/lib/payments/checkout-discounts'
import { startExerciseVideosMonthlyCheckout } from '@/lib/payments/exercise-videos-checkout-client'
import { createClient } from '@/lib/supabase/client'
import { clientColors as colors, radius, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile } from '@/types/database'

const supabase = createClient()
const priceLabel = formatInrFromPaise(EXERCISE_VIDEOS_MONTHLY_PAISE)

type VideoAccess = {
  locked?: boolean
  entitled?: boolean
  unlimited?: boolean
  reason?: string
  trialEndsAt?: string | null
  accessUntil?: string | null
  pricePaise?: number
  error?: string
}

/**
 * Browser checkout for monthly exercise form videos.
 * Shareable at /library/unlock — opens Razorpay in the user's browser.
 */
export default function ExerciseLibraryUnlockPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [access, setAccess] = useState<VideoAccess | null>(null)
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
      if (row?.payment_confirmed) {
        const res = await fetch('/api/payment/addons/exercise-videos', { credentials: 'include' })
        const json = (await res.json().catch(() => null)) as VideoAccess | null
        if (res.ok && json) setAccess(json)
      }
      setLoading(false)
    }
    void load()
  }, [router])

  const entitled = justUnlocked || access?.entitled === true

  const handlePay = async () => {
    setError(null)
    setPaying(true)
    try {
      const result = await startExerciseVideosMonthlyCheckout()
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
          <h1 style={{ ...authStyles.title, fontSize: 22 }}>Plan required</h1>
          <p style={{ margin: `0 0 ${spacing[4]}px`, fontSize: 15, lineHeight: 1.5, color: colors.textSecondary }}>
            Exercise form videos unlock after you start a plan. Choose a plan, pay in your browser, then return here
            if you need the monthly videos.
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
            View plans
          </Link>
        </div>
      </div>
    )
  }

  if (entitled) {
    const included = access?.unlimited === true || access?.reason === 'unlimited_paid' || access?.reason === 'lifetime_library'
    const trial = access?.reason === 'trial'
    return (
      <div style={authStyles.page}>
        <div style={authStyles.card}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing[3] }}>
            <CheckCircle2 size={40} color={colors.success} />
          </div>
          <h1 style={{ ...authStyles.title, fontSize: 22 }}>
            {included ? 'Form videos are included' : trial ? 'Your 2-day video trial is on' : 'Form videos are active'}
          </h1>
          <p style={{ margin: `0 0 ${spacing[4]}px`, fontSize: 15, lineHeight: 1.5, color: colors.textSecondary, textAlign: 'center' }}>
            {included
              ? 'Your plan includes exercise videos. Open Workout, then tap Watch video on the exercise.'
              : trial
                ? 'Plans under ₹600 include videos for 2 days. After that it is ₹69/month. Open Workout to watch now.'
                : 'This month of form videos is unlocked. Open Workout, then tap Watch video on the exercise.'}
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
          <h1 style={{ ...authStyles.title, fontSize: 22 }}>Continue form videos</h1>
          <p style={{ margin: `0 0 ${spacing[3]}px`, fontSize: 15, lineHeight: 1.55, color: colors.textSecondary, textAlign: 'center' }}>
            Your 2-day video trial has ended. Keep every lift in your workout tracker for {priceLabel}/month.
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
              {priceLabel}/month — form videos for every lift in your tracker
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
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.textMuted }}>/month</span>
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
            {paying ? 'Opening checkout…' : !razorpayReady ? 'Loading checkout…' : `Pay ${priceLabel} for this month`}
          </button>

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
