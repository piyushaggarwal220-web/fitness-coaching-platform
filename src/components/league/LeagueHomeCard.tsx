'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { colors, spacing } from '@/lib/design-tokens'
import {
  LEAGUE_TIER_DETAILS,
  LEAGUE_TIER_LABELS,
  type LeagueStandingRow,
  type LeagueTier,
} from '@/lib/league/scoring'

type LeaguePayload = {
  optIn: boolean
  me: LeagueStandingRow | null
  standings: LeagueStandingRow[]
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
    return () => { active = false }
  }, [])

  if (error) return null

  const tier = (data?.me?.tier ?? 'foundation') as LeagueTier
  const tierColor = LEAGUE_TIER_DETAILS[tier].color
  const loading = !data

  return (
    <section style={{ marginBottom: spacing[7] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing[3] }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' }}>
            Consistency League
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
            Season standings with your coach&apos;s squad
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
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: `${tierColor}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Trophy size={22} color={tierColor} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <>
                <div className="skeleton" style={{ height: 18, width: '55%', borderRadius: 8, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 13, width: '40%', borderRadius: 8 }} />
              </>
            ) : !data.optIn ? (
              <>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
                  Join this season
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
                  Opt in to climb the squad ranks
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
                  {LEAGUE_TIER_LABELS[tier]}
                  {data.me?.rank ? ` · #${data.me.rank}` : ''}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
                  {data.me?.points ?? 0} pts
                  {data.me?.streakDays ? ` · ${data.me.streakDays}d streak` : ''}
                  {data.standings.length ? ` · ${data.standings.length} in squad` : ''}
                </p>
              </>
            )}
          </div>
          <ArrowRight size={20} color={colors.textMuted} />
        </div>
      </Card>
    </section>
  )
}
