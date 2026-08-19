'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { brandTitle } from '@/lib/brand'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/coach-theme'

const supabase = createClient()

export default function CoachAnalyticsPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    total: 0,
    activePlans: 0,
    pendingCheckins: 0,
    low: 0,
    medium: 0,
    high: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const coach = await requireCoach(supabase, router)
      if (!coach) { setLoading(false); return }

      const { data: clients } = await supabase
        .from('profiles')
        .select('complexity_tier')
        .eq('coach_id', coach.id)

      const { count: pending } = await supabase
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('reviewed', false)
        .is('auto_reply_at', null)

      const { count: plans } = await supabase
        .from('plans')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('active', true)

      const tiers = (clients ?? []) as Array<{ complexity_tier: string | null }>
      setStats({
        total: tiers.length,
        activePlans: plans ?? 0,
        pendingCheckins: pending ?? 0,
        low: tiers.filter((c) => c.complexity_tier === 'low').length,
        medium: tiers.filter((c) => c.complexity_tier === 'medium').length,
        high: tiers.filter((c) => c.complexity_tier === 'high').length,
      })
      setLoading(false)
    }
    void load()
  }, [router])

  if (loading) return <CoachShell loading />

  return (
    <CoachShell>
      <h1 style={styles.title}>{brandTitle('Analytics')}</h1>
      <p style={styles.subtitle}>Client portfolio overview</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Stat label="Total clients" value={stats.total} />
        <Stat label="Active plans" value={stats.activePlans} accent />
        <Stat label="Pending check-ins" value={stats.pendingCheckins} />
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: colors.textPrimary }}>Complexity distribution</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Stat label="Low" value={stats.low} />
        <Stat label="Medium" value={stats.medium} />
        <Stat label="High" value={stats.high} />
      </div>
    </CoachShell>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      padding: 20,
      borderRadius: 16,
      backgroundColor: colors.bgCard,
      border: `1px solid ${colors.borderSubtle}`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: accent ? colors.accent : colors.textPrimary }}>{value}</div>
      <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  )
}
