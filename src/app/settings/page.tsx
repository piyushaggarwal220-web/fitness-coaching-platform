'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClientShell } from '@/components/ui/ClientShell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ActiveSubscriptionCard } from '@/components/dashboard/ActiveSubscriptionCard'
import { authenticateClient } from '@/lib/onboarding'
import { getActiveSubscription } from '@/lib/subscription'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing } from '@/lib/design-tokens'
import type { OnboardingProfile, Purchase } from '@/types/database'

const supabase = createClient()

export default function ClientSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [purchase, setPurchase] = useState<Purchase | null>(null)

  useEffect(() => {
    const load = async () => {
      const result = await authenticateClient(supabase, router, { requirePayment: true })
      if (!result?.profile) {
        setLoading(false)
        return
      }
      setProfile(result.profile)

      const { data } = await supabase
        .from('purchases')
        .select('id, user_id, status, amount_paise, currency, created_at, plan_name, plan_slug')
        .eq('user_id', result.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setPurchase((data as Purchase | null) ?? null)
      setLoading(false)
    }
    void load()
  }, [router])

  const subscription = getActiveSubscription(
    purchase,
    profile?.subscription_expires_at ?? null
  )

  if (loading) return <ClientShell title="Settings" loading />

  return (
    <ClientShell title="Settings">
      {subscription && <ActiveSubscriptionCard subscription={subscription} />}

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
