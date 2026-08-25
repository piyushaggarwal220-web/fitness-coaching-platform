'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Lock } from 'lucide-react'
import { BRAND_NAME } from '@/lib/brand'
import { getClientPaymentGatePath, hasClientEntitlement } from '@/lib/entitlements'
import { createClient } from '@/lib/supabase/client'
import { getActiveSubscription, checkoutHrefForSubscription } from '@/lib/subscription'
import { authStyles } from '@/lib/auth-styles'
import { colors, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile, Purchase } from '@/types/database'

const supabase = createClient()

/**
 * Hard paywall when membership has fully ended.
 * No dashboard, no bottom nav, no other app routes — payment only.
 */
export default function MembershipRequiredPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [endsLabel, setEndsLabel] = useState<string | null>(null)
  const [checkoutHref, setCheckoutHref] = useState('/checkout?plan=3_months')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('payment_confirmed, access_source, subscription_expires_at, name, role')
        .eq('id', user.id)
        .maybeSingle()

      const row = profile as OnboardingProfile | null
      if (row?.role === 'coach') {
        router.replace('/coach/dashboard')
        return
      }
      if (row?.role === 'admin' || row?.role === 'super_admin') {
        router.replace('/admin/dashboard')
        return
      }

      if (hasClientEntitlement(row)) {
        router.replace('/dashboard')
        return
      }

      // Brand-new unpaid accounts use normal checkout, not this paywall.
      if (getClientPaymentGatePath(row) !== '/membership-required') {
        router.replace('/checkout?plan=6_months')
        return
      }

      const { data: purchase } = await supabase
        .from('purchases')
        .select('plan_slug, plan_name, created_at, status')
        .eq('user_id', user.id)
        .in('status', ['captured', 'redeemed'])
        .neq('plan_slug', 'exercise_library')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const purchaseRow = purchase as Pick<
        Purchase,
        'plan_slug' | 'plan_name' | 'created_at' | 'status'
      > | null
      const subscription = getActiveSubscription(
        purchaseRow
          ? {
              ...purchaseRow,
              // Enrollment redemptions use status "redeemed"; treat as captured for renew math.
              status: 'captured',
            }
          : null,
        row?.subscription_expires_at ?? null
      )
      if (subscription) {
        setEndsLabel(subscription.endsLabel)
        setCheckoutHref(
          checkoutHrefForSubscription({
            ...subscription,
            status: 'expired',
          })
        )
      } else if (row?.subscription_expires_at) {
        const ends = new Date(row.subscription_expires_at)
        if (!Number.isNaN(ends.getTime())) {
          setEndsLabel(
            ends.toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          )
        }
      }

      setLoading(false)
    }
    void load()
  }, [router])

  if (loading) {
    return (
      <div style={authStyles.page}>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 15 }}>Checking membership…</p>
      </div>
    )
  }

  return (
    <div
      style={{
        ...authStyles.page,
        background:
          'radial-gradient(ellipse at top, rgba(249,115,22,0.12) 0%, transparent 55%), var(--bg-primary, #09090b)',
      }}
    >
      <div style={{ ...authStyles.card, maxWidth: 420 }}>
        <p style={authStyles.logo}>{BRAND_NAME}</p>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            margin: '0 auto 20px',
            backgroundColor: colors.dangerMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Lock size={26} color={colors.danger} aria-hidden />
        </div>
        <h1 style={{ ...authStyles.title, marginBottom: 10 }}>Complete payment to continue</h1>
        <p
          style={{
            margin: `0 0 ${spacing[5]}px`,
            textAlign: 'center',
            fontSize: 15,
            lineHeight: 1.55,
            color: colors.textSecondary,
          }}
        >
          {endsLabel
            ? `Your coaching membership ended on ${endsLabel}. Renew to unlock your dashboard, plan, tracker, and coach chat.`
            : 'Your coaching membership has ended. Renew to unlock your dashboard, plan, tracker, and coach chat.'}
        </p>
        <button
          type="button"
          disabled={paying}
          onClick={() => {
            setPaying(true)
            router.push(checkoutHref)
          }}
          style={{
            ...authStyles.button,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            opacity: paying ? 0.75 : 1,
          }}
        >
          <CreditCard size={18} aria-hidden />
          Complete payment
        </button>
        <p
          style={{
            margin: `${spacing[4]}px 0 0`,
            textAlign: 'center',
            fontSize: 12,
            color: colors.textMuted,
            lineHeight: 1.45,
          }}
        >
          Access stays locked until payment is completed. There is no other way into the app.
        </p>
      </div>
    </div>
  )
}
