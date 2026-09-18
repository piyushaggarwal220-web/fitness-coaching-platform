'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Check,
  CheckCircle2,
  ListChecks,
  Lock,
  Map,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import {
  canAccessInstantFeature,
  latestDigitalPlanSlug,
  purchaseRowsIndicateCoaching,
  purchaseRowsIndicateDigital,
  type InstantFeature,
} from '@/lib/instant-feature-access'
import { formatInrFromPaise } from '@/lib/payments/checkout-discounts'
import {
  PLATFORM_UNLOCK_META,
  parsePlatformUnlockSku,
  type PlatformUnlockSku,
} from '@/lib/payments/platform-unlock-catalog'
import { startPlatformUnlockCheckout } from '@/lib/payments/platform-unlock-checkout-client'
import { createClient } from '@/lib/supabase/client'
import { colors, radius, spacing } from '@/lib/design-tokens'
import {
  INSTANT_BUNDLE_PITCH,
  instantBundleSavingsPaise,
  instantUnlockPitchForFeature,
} from '@/lib/instant-unlock-pitch'
import type { OnboardingProfile } from '@/types/database'

const supabase = createClient()

function redirectForFeature(sku: PlatformUnlockSku): string {
  if (sku === 'unlock_tracker') return '/tracker'
  if (sku === 'unlock_journey') return '/journey'
  if (sku === 'unlock_ai_chat') return '/client/chat'
  return '/dashboard'
}

function UnlockIcon({ sku }: { sku: PlatformUnlockSku }) {
  if (sku === 'unlock_tracker') return <ListChecks size={28} color={colors.accent} strokeWidth={2.2} />
  if (sku === 'unlock_journey') return <Map size={28} color={colors.accent} strokeWidth={2.2} />
  if (sku === 'unlock_ai_chat') return <MessageCircle size={28} color={colors.accent} strokeWidth={2.2} />
  return <Sparkles size={28} color={colors.accent} strokeWidth={2.2} />
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
  const pitch =
    sku === 'unlock_platform_bundle'
      ? INSTANT_BUNDLE_PITCH
      : instantUnlockPitchForFeature(meta.feature ?? 'tracker')
  const savings = formatInrFromPaise(instantBundleSavingsPaise())

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [hasCoaching, setHasCoaching] = useState(false)
  const [isInstantOnly, setIsInstantOnly] = useState(false)
  const [digitalSlug, setDigitalSlug] = useState<string | null>(null)
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
        .limit(12)

      const coaching = purchaseRowsIndicateCoaching(purchases)
      const digital = purchaseRowsIndicateDigital(purchases)
      setHasCoaching(coaching)
      setIsInstantOnly(digital && !coaching)
      setDigitalSlug(latestDigitalPlanSlug(purchases))
      setProfile(row)
      setLoading(false)
    }
    void load()
  }, [router, sku])

  const entitled =
    justUnlocked ||
    meta.features.every((feature: InstantFeature) =>
      canAccessInstantFeature(profile, feature, {
        hasCoachingPurchase: hasCoaching,
        planSlug: digitalSlug,
        isInstantOnly,
      })
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
        <div
          style={{
            ...authStyles.card,
            textAlign: 'center',
            animation: 'cardEnter 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing[3] }}>
            <CheckCircle2 size={44} color={colors.success} />
          </div>
          <h1 style={{ ...authStyles.title, fontSize: 22, marginBottom: spacing[2] }}>Unlocked for life</h1>
          <p
            style={{
              margin: `0 0 ${spacing[4]}px`,
              fontSize: 15,
              lineHeight: 1.5,
              color: colors.textSecondary,
            }}
          >
            {meta.label} is ready on your account. One payment — yours forever.
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
    <div
      style={{
        ...authStyles.page,
        background:
          'radial-gradient(ellipse 90% 55% at 50% -5%, rgba(249,115,22,0.18), transparent 55%), #09090b',
      }}
    >
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayReady(true)}
      />
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
          borderRadius: radius.lg,
          border: '1px solid rgba(249,115,22,0.22)',
          background:
            'linear-gradient(165deg, rgba(249,115,22,0.14) 0%, rgba(24,24,27,0.98) 36%, rgba(9,9,11,1) 100%)',
          boxShadow: '0 22px 56px rgba(0,0,0,0.4)',
          animation: 'cardEnter 420ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <div style={{ padding: `${spacing[5]}px ${spacing[4]}px ${spacing[4]}px` }}>
          <p
            style={{
              margin: 0,
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: colors.accent,
            }}
          >
            {BRAND_NAME}
          </p>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: spacing[4],
              padding: '5px 10px',
              borderRadius: radius.full,
              background: 'rgba(249,115,22,0.14)',
              border: '1px solid rgba(249,115,22,0.28)',
              color: colors.accent,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <Lock size={12} strokeWidth={2.5} />
            {pitch.eyebrow}
          </div>

          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              marginTop: spacing[4],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: colors.accentMuted,
              border: '1px solid rgba(249,115,22,0.25)',
            }}
          >
            <UnlockIcon sku={sku} />
          </div>

          <h1
            style={{
              margin: `${spacing[3]}px 0 0`,
              fontSize: 'clamp(1.4rem, 5vw, 1.75rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              color: colors.textPrimary,
            }}
          >
            {pitch.headline}
          </h1>

          <p
            style={{
              margin: `${spacing[2]}px 0 0`,
              fontSize: 14,
              lineHeight: 1.55,
              color: colors.textSecondary,
            }}
          >
            {pitch.blurb}
          </p>

          <ul
            style={{
              listStyle: 'none',
              margin: `${spacing[4]}px 0 0`,
              padding: 0,
              display: 'grid',
              gap: 10,
            }}
          >
            {pitch.benefits.map((item) => (
              <li
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: colors.textPrimary,
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    flexShrink: 0,
                    marginTop: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: colors.successMuted,
                    color: colors.success,
                  }}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div
            style={{
              marginTop: spacing[5],
              padding: spacing[3],
              borderRadius: radius.md,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${colors.borderSubtle}`,
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: colors.textPrimary,
                lineHeight: 1,
              }}
            >
              {priceLabel}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textMuted, fontWeight: 600 }}>
              One-time · lifetime access · not monthly
            </p>
            {sku === 'unlock_platform_bundle' && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.accent, fontWeight: 700 }}>
                Save {savings} vs buying each add-on
              </p>
            )}
          </div>

          {error && (
            <p
              style={{
                margin: `${spacing[3]}px 0 0`,
                color: colors.danger,
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={paying || (!razorpayReady && process.env.NODE_ENV === 'production')}
            style={{
              ...authStyles.button,
              width: '100%',
              marginTop: spacing[4],
              opacity: paying ? 0.75 : 1,
            }}
          >
            {paying ? 'Opening checkout…' : `Pay ${priceLabel} · Unlock now`}
          </button>

          {sku !== 'unlock_platform_bundle' && (
            <Link
              href="/unlock?feature=bundle"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: spacing[3],
                padding: '12px 14px',
                borderRadius: radius.md,
                border: '1px solid rgba(249,115,22,0.28)',
                background: 'rgba(249,115,22,0.08)',
                color: colors.textPrimary,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              <Sparkles size={16} color={colors.accent} />
              Or unlock all three for{' '}
              {formatInrFromPaise(PLATFORM_UNLOCK_META.unlock_platform_bundle.amountPaise)}
            </Link>
          )}

          <p
            style={{
              margin: `${spacing[3]}px 0 0`,
              textAlign: 'center',
              fontSize: 12,
              lineHeight: 1.45,
              color: colors.textMuted,
            }}
          >
            Secure checkout via Razorpay. Coaching memberships already include these.
          </p>
        </div>
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
