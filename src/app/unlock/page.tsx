'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Lock } from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { canAccessInstantFeature, type InstantFeature } from '@/lib/instant-feature-access'
import { formatInrFromPaise } from '@/lib/payments/checkout-discounts'
import {
  PLATFORM_UNLOCK_META,
  parsePlatformUnlockSku,
  type PlatformUnlockSku,
} from '@/lib/payments/platform-unlock-catalog'
import { startPlatformUnlockCheckout } from '@/lib/payments/platform-unlock-checkout-client'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile } from '@/types/database'

const supabase = createClient()

function redirectForFeature(sku: PlatformUnlockSku): string {
  if (sku === 'unlock_tracker') return '/tracker'
  if (sku === 'unlock_journey') return '/journey'
  if (sku === 'unlock_ai_chat') return '/client/chat'
  return '/dashboard'
}

function PlatformUnlockInner() {
  const router = useRouter()
  const search = useSearchParams()
  const sku = useMemo(
    () => parsePlatformUnlockSku(search.get('feature') || search.get('sku')) ?? 'unlock_platform_bundle',
    [search]
  )
  const meta = PLATFORM_UNLOCK_META[sku]
  const priceLabel = formatInrFromPaise(meta.amountPaise)

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [hasCoaching, setHasCoaching] = useState(false)
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
        router.replace(`/login?redirect=${encodeURIComponent(`/unlock?feature=${sku}`)}`)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select(
          'id, name, email, payment_confirmed, access_source, role, instant_gates_enabled, addon_tracker_entitled, addon_journey_entitled, addon_ai_chat_entitled'
        )
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

      const { data: purchases } = await supabase
        .from('purchases')
        .select('plan_slug, status')
        .eq('user_id', user.id)
        .eq('status', 'captured')
        .order('created_at', { ascending: false })
        .limit(5)

      const coaching = (purchases ?? []).some(
        (p: { plan_slug?: string | null }) =>
          p.plan_slug &&
          !String(p.plan_slug).startsWith('digital_') &&
          !String(p.plan_slug).startsWith('unlock_') &&
          p.plan_slug !== 'exercise_library'
      )
      setHasCoaching(coaching)
      setProfile(row)
      setLoading(false)
    }
    void load()
  }, [router, sku])

  const entitled =
    justUnlocked ||
    meta.features.every((feature: InstantFeature) =>
      canAccessInstantFeature(profile, feature, { hasCoachingPurchase: hasCoaching })
    )

  const handlePay = async () => {
    setError(null)
    setPaying(true)
    try {
      const result = await startPlatformUnlockCheckout(sku)
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
            Unlock platform features after you buy an Instant plan.
          </p>
          <Link
            href="/customised-plan"
            style={{ ...authStyles.button, display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            View Instant plans
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
          <h1 style={{ ...authStyles.title, fontSize: 22 }}>Unlocked</h1>
          <p
            style={{
              margin: `0 0 ${spacing[4]}px`,
              fontSize: 15,
              lineHeight: 1.5,
              color: colors.textSecondary,
              textAlign: 'center',
            }}
          >
            {meta.label} is available on your account for life.
          </p>
          <Link
            href={redirectForFeature(sku)}
            style={{ ...authStyles.button, display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Continue
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={authStyles.page}>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayReady(true)}
      />
      <div style={authStyles.card}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing[3] }}>
          <Lock size={36} color={colors.accent} />
        </div>
        <p style={authStyles.logo}>{BRAND_NAME}</p>
        <h1 style={{ ...authStyles.title, fontSize: 22 }}>{meta.label}</h1>
        <p
          style={{
            margin: `0 0 ${spacing[2]}px`,
            fontSize: 28,
            fontWeight: 800,
            color: colors.textPrimary,
            textAlign: 'center',
          }}
        >
          {priceLabel}
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.textMuted }}> lifetime</span>
        </p>
        <p
          style={{
            margin: `0 0 ${spacing[4]}px`,
            fontSize: 15,
            lineHeight: 1.5,
            color: colors.textSecondary,
            textAlign: 'center',
          }}
        >
          Instant plans include your customised plan. Coaching memberships already include tracker,
          journey, and AI chat.
        </p>
        {error && (
          <p style={{ margin: `0 0 ${spacing[3]}px`, color: colors.danger, fontSize: 14 }}>{error}</p>
        )}
        <button
          type="button"
          onClick={() => void handlePay()}
          disabled={paying || (!razorpayReady && process.env.NODE_ENV === 'production')}
          style={authStyles.button}
        >
          {paying ? 'Opening checkout…' : `Pay ${priceLabel}`}
        </button>
        {sku !== 'unlock_platform_bundle' && (
          <Link
            href="/unlock?feature=bundle"
            style={{
              display: 'block',
              marginTop: spacing[3],
              textAlign: 'center',
              color: colors.textSecondary,
              fontSize: 14,
            }}
          >
            Or unlock all three for{' '}
            {formatInrFromPaise(PLATFORM_UNLOCK_META.unlock_platform_bundle.amountPaise)}
          </Link>
        )}
      </div>
    </div>
  )
}

export default function PlatformUnlockPage() {
  return (
    <Suspense
      fallback={
        <div style={authStyles.page}>
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 15 }}>Loading…</p>
        </div>
      }
    >
      <PlatformUnlockInner />
    </Suspense>
  )
}
