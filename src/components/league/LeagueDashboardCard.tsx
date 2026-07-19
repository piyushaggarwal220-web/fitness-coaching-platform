'use client'

import Link from 'next/link'
import { ChevronRight, Flame, Shield, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { colors, spacing } from '@/lib/design-tokens'
import { LEAGUE_TIER_DETAILS, LEAGUE_TIER_LABELS, type LeagueStandingRow, type LeagueTier } from '@/lib/league/scoring'

type Props = {
  me: LeagueStandingRow | null
  optIn: boolean
  seasonKey: string
  loading?: boolean
}

export function LeagueDashboardCard({ me, optIn, seasonKey, loading }: Props) {
  if (loading) {
    return <div className="skeleton" style={{ height: 96, borderRadius: 16, marginBottom: spacing[7] }} />
  }

  const tier = (me?.tier ?? 'foundation') as LeagueTier

  return (
    <section style={{ marginBottom: spacing[7] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>Consistency League</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textMuted }}>{seasonKey} · climb by showing up</p>
        </div>
        <Link href="/league" style={{ fontSize: 13, fontWeight: 600, color: colors.accent, textDecoration: 'none' }}>
          View standings
        </Link>
      </div>
      <Card
        variant="glass"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderColor: 'rgba(249,115,22,0.24)',
          background: 'radial-gradient(circle at 92% 5%, rgba(249,115,22,0.2), transparent 38%), rgba(24,24,27,0.82)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '14px 14px 19px 19px',
              backgroundColor: '#2a170d',
              border: '2px solid rgba(249,115,22,0.48)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 18px rgba(249,115,22,0.16)',
            }}
          >
            <Shield size={22} color={LEAGUE_TIER_DETAILS[tier].color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 18 }}>
              {LEAGUE_TIER_LABELS[tier]}
              {me && me.rank > 0 ? ` · #${me.rank}` : ''}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textSecondary }}>
              {me ? `${me.points} pts · ${me.streakDays}-day momentum` : 'Start logging to earn points'}
              {!optIn ? ' · Private until you opt in' : ''}
            </p>
          </div>
          <ChevronRight size={20} color={colors.textMuted} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 999, background: colors.accentMuted, color: colors.accent, fontSize: 11, fontWeight: 700 }}>
            <Flame size={13} /> Missions live
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 999, background: colors.bgElevated, color: colors.textMuted, fontSize: 11, fontWeight: 700 }}>
            <Trophy size={13} /> {optIn ? 'Squad board' : 'Private score'}
          </span>
        </div>
      </Card>
    </section>
  )
}
