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
  const [saving, setSaving] = useState(false)
  const [leagueOptIn, setLeagueOptIn] = useState(false)
  const [message, setMessage] = useState('')
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
      setLeagueOptIn(Boolean(result.profile.league_opt_in))

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

  const saveLeagueOptIn = async (optIn: boolean) => {
    setSaving(true)
    setMessage('')
    const res = await fetch('/api/league', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ optIn }),
    })
    const json = await res.json()
    if (!res.ok) {
      setMessage(json.error ?? 'Failed to save')
      setSaving(false)
      return
    }
    setLeagueOptIn(optIn)
    setMessage(optIn ? 'You’re on the Consistency League board.' : 'You’re hidden from standings.')
    setSaving(false)
  }

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
        <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 16 }}>Consistency League</p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.45 }}>
          Opt in to appear on your coach’s leaderboard. Only first name + last initial are shown.
          Points come from tracker consistency and on-time check-ins — never weight or body metrics.
        </p>
        {message && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.success }}>{message}</p>
        )}
        {leagueOptIn ? (
          <Button fullWidth variant="secondary" loading={saving} onClick={() => void saveLeagueOptIn(false)}>
            Leave standings
          </Button>
        ) : (
          <Button fullWidth loading={saving} onClick={() => void saveLeagueOptIn(true)}>
            Join standings
          </Button>
        )}
        <Button
          fullWidth
          variant="ghost"
          style={{ marginTop: 10 }}
          onClick={() => router.push('/league')}
        >
          Open league
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
    </ClientShell>
  )
}
