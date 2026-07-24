'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { colors, spacing } from '@/lib/design-tokens'
import {
  LEAGUE_TIER_DETAILS,
  LEAGUE_TIER_LABELS,
  normalizeLeagueTier,
  type LeagueStandingRow,
  type LeagueTier,
} from '@/lib/league/scoring'

type LeaguePayload = {
  optIn: boolean
  me: LeagueStandingRow | null
  standings: LeagueStandingRow[]
  division?: LeagueTier
}

/** Compact Consistency League summary for the client home dashboard. */
export function LeagueHomeCard() {
  const router = useRouter()
  const [data, setData] = useState<LeaguePayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void fetch('/api/league', { credentials: 'include' })
      .then(async (response) => {
        const json = await response.json().catch(() => null)
        if (!response.ok) throw new Error(json?.error ?? 'Failed')
        if (active) setData(json as LeaguePayload)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [])

  if (error) return null

  const tier = normalizeLeagueTier(data?.me?.tier ?? data?.division ?? 'bronze')
  const tierColor = LEAGUE_TIER_DETAILS[tier].color
  const loading = !data

  return (
    <section style={{ marginBottom: spacing[7] }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: spacing[3],
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: colors.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            Consistency League
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
            Monthly ladder · top 10% advance
          </p>
        </div>
      </div>

      <Card
        variant="elevated"
        className="card-hover"
        onClick={() => router.push('/league')}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: `${tierColor}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Trophy size={22} color={tierColor} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>Loading standings…</p>
            ) : !data.optIn ? (
              <>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
                  Join {LEAGUE_TIER_LABELS[tier]}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
                  Opt in to climb with your coach&apos;s squad
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontWeight: 800, color: colors.textPrimary, fontSize: 16 }}>
                  {LEAGUE_TIER_LABELS[tier]}
                  {data.me?.rank ? ` · #${data.me.rank}` : ''}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
                  {data.me?.points ?? 0} pts this month
                  {data.me?.streakDays ? ` · ${data.me.streakDays}d streak` : ''}
                </p>
              </>
            )}
          </div>
          <ArrowRight size={18} color={colors.textMuted} />
        </div>
      </Card>
    </section>
  )
}
