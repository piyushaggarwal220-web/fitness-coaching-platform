'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ActiveSubscriptionCard } from '@/components/dashboard/ActiveSubscriptionCard'
import { MembershipRenewalBanner } from '@/components/dashboard/MembershipRenewalBanner'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import { authenticateClient } from '@/lib/onboarding'
import {
  EXERCISE_LIBRARY_ADDON_PAISE,
  formatInrFromPaise,
} from '@/lib/payments/checkout-discounts'
import { getActiveSubscription, getMembershipRenewalPrompt } from '@/lib/subscription'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile, Purchase } from '@/types/database'

const supabase = createClient()

export default function ClientSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [photoConsent, setPhotoConsent] = useState(false)
  const [quoteConsent, setQuoteConsent] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentMsg, setConsentMsg] = useState('')

  useEffect(() => {
    const load = async () => {
      const result = await authenticateClient(supabase, router, { requirePayment: true })
      if (!result?.profile) {
        setLoading(false)
        return
      }
      setProfile(result.profile)
      setPhotoConsent(Boolean(result.profile.marketing_photo_consent_at))
      setQuoteConsent(Boolean(result.profile.marketing_quote_consent_at))

      const { data } = await supabase
        .from('purchases')
        .select('id, user_id, status, amount_paise, currency, created_at, plan_name, plan_slug')
        .eq('user_id', result.user.id)
        .neq('plan_slug', 'exercise_library')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setPurchase((data as Purchase | null) ?? null)
      setLoading(false)
    }
    void load()
  }, [router])

  const saveConsent = async (next: { photoConsent?: boolean; quoteConsent?: boolean }) => {
    setConsentBusy(true)
    setConsentMsg('')
    const res = await fetch('/api/client/marketing-consent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    const data = await res.json()
    setConsentBusy(false)
    if (!res.ok) {
      setConsentMsg(data.error ?? 'Could not save consent.')
      return
    }
    if (next.photoConsent != null) setPhotoConsent(next.photoConsent)
    if (next.quoteConsent != null) setQuoteConsent(next.quoteConsent)
    setConsentMsg('Saved.')
  }

  const subscription = getActiveSubscription(
    purchase,
    profile?.subscription_expires_at ?? null
  )
  const renewalPrompt = getMembershipRenewalPrompt(profile, purchase)

  if (loading) return <ClientShell title="Settings" loading />

  return (
    <ClientShell title="Settings">
      {renewalPrompt && <MembershipRenewalBanner prompt={renewalPrompt} />}
      {subscription && <ActiveSubscriptionCard subscription={subscription} />}

      <Card variant="elevated" style={{ marginBottom: spacing[3] }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Install Lurvox app</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
          Add Lurvox to your home screen for faster check-ins, tracker, and coach chat.
        </p>
        <Button fullWidth onClick={() => router.push('/install')}>
          Android & iPhone install guide
        </Button>
      </Card>

      <Card variant="glass" style={{ marginBottom: spacing[3] }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Share your transformation</p>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          Optional. Lets your coach nominate your before/after for the Lurvox website. You can withdraw anytime.
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={photoConsent}
            disabled={consentBusy}
            onChange={(e) => void saveConsent({ photoConsent: e.target.checked })}
          />
          <span>I agree Lurvox may use my progress photos (without my full name) in marketing.</span>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={quoteConsent}
            disabled={consentBusy}
            onChange={(e) => void saveConsent({ quoteConsent: e.target.checked })}
          />
          <span>I agree Lurvox may use a short quote from my check-ins or feedback in marketing.</span>
        </label>
        {consentMsg && <p style={{ margin: '10px 0 0', fontSize: 13, color: colors.textMuted }}>{consentMsg}</p>}
      </Card>

      {!profileEntitledForExerciseLibrary(profile) ? (
        <Card variant="elevated" style={{ marginBottom: spacing[3] }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Exercise form videos</p>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
            Unlock every lift in your workout tracker for {formatInrFromPaise(EXERCISE_LIBRARY_ADDON_PAISE)},
            one-time. Pay securely in your browser.
          </p>
          <Button fullWidth onClick={() => router.push('/library/unlock')}>
            Unlock form videos
          </Button>
        </Card>
      ) : null}

      <Card variant="glass">
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Account</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
          Manage your profile and notification preferences.
        </p>
        <Button fullWidth variant="secondary" onClick={() => router.push('/profile')}>
          Edit profile
        </Button>
      </Card>

      <Card variant="elevated" style={{ marginTop: spacing[3] }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Support</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
          Report issues or contact the coaching team.
        </p>
        <Button fullWidth onClick={() => router.push('/client/support')}>
          Contact support
        </Button>
      </Card>

      <Card variant="glass" style={{ marginTop: spacing[3] }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Session</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary }}>
          Sign out on this device. Your coaching data stays saved.
        </p>
        <Button
          fullWidth
          variant="secondary"
          onClick={async () => {
            const { invalidateSessionCache } = await import('@/lib/session-restore')
            invalidateSessionCache()
            await supabase.auth.signOut()
            router.push('/login')
            router.refresh()
          }}
        >
          Sign out
        </Button>
      </Card>
    </ClientShell>
  )
}
