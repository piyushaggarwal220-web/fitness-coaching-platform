'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  Info,
  ListChecks,
  LockKeyhole,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { Button } from '@/components/ui/Button'
import { authenticateClient } from '@/lib/onboarding'
import { createClient } from '@/lib/supabase/client'
import { colors } from '@/lib/design-tokens'
import {
  LEAGUE_LADDER,
  LEAGUE_TIER_DETAILS,
  LEAGUE_TIER_LABELS,
  LEAGUE_TIER_ORDER,
  normalizeLeagueTier,
  pointsToNextTier,
  type LeagueMission,
  type LeagueStandingRow,
  type LeagueTier,
} from '@/lib/league/scoring'
import { CRAZY_GATE_COPY, nextEligibleLeagueDivision } from '@/lib/league/eligibility'
import { LEAGUE_ROOM_MIN_OPT_INS } from '@/lib/league/room'
import { useRouter } from 'next/navigation'
import styles from './league.module.css'

const supabase = createClient()

type LeaguePayload = {
  optIn: boolean
  seasonKey: string
  startsOn: string
  endsOn: string
  me: LeagueStandingRow | null
  standings: LeagueStandingRow[]
  coachId: string | null
  missions: LeagueMission[]
  division?: LeagueTier
  crazyEligible?: boolean
  crazyGateBlocked?: boolean
  planSlug?: string | null
  worldLeaderboardStatus?: 'coming_soon'
  roomOpen?: boolean
  optInCount?: number
  optInTarget?: number
}

export default function LeaguePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<LeaguePayload | null>(null)

  useEffect(() => {
    let cancelled = false
    authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true })
      .then(async (auth) => {
        if (!auth) return null
        const response = await fetch('/api/league', { credentials: 'include' })
        const json = await response.json()
        if (!response.ok) throw new Error(json.error ?? 'Failed to load league')
        return json as LeaguePayload
      })
      .then((payload) => {
        if (!cancelled && payload) setData(payload)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Failed to load league')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [router])

  const toggleOptIn = async (optIn: boolean) => {
    setSaving(true)
    setError('')
    const res = await fetch('/api/league', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ optIn }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Failed to update preference')
      setSaving(false)
      return
    }
    setData((current) => (
      Array.isArray(json.standings)
        ? json as LeaguePayload
        : current
          ? { ...current, optIn }
          : current
    ))
    setSaving(false)
  }

  if (loading) return <ClientShell title="League" loading />

  const tier = normalizeLeagueTier(data?.me?.tier ?? data?.division ?? 'bronze')
  const crazyEligible = data?.crazyEligible ?? false
  const { next: eligibleNext, blockedByCrazyGate } = nextEligibleLeagueDivision(tier, crazyEligible)
  const tierIndex = LEAGUE_LADDER.indexOf(tier === 'world' ? 'crazy_3' : tier)
  const nextDivision = eligibleNext
  const pointsNeeded = data?.me && data.optIn
    ? pointsToNextTier(tier, data.me.points, data.standings)
    : null
  const currentTierFloor = data?.standings
    .reduce((floor, row) => Math.min(floor, row.points), data?.me?.points ?? 0) ?? 0
  const nextFloor = pointsNeeded != null && data?.me ? data.me.points + pointsNeeded : null
  const rankProgress = nextFloor != null && data?.me && nextFloor > currentTierFloor
    ? Math.max(4, Math.min(100, ((data.me.points - currentTierFloor) / (nextFloor - currentTierFloor)) * 100))
    : data?.me?.promotionZone ? 100 : 12
  const daysRemaining = data ? remainingDays(data.endsOn) : 0
  const roomOpen = data?.roomOpen ?? false
  const optInCount = data?.optInCount ?? 0
  const optInTarget = data?.optInTarget ?? LEAGUE_ROOM_MIN_OPT_INS
  const waitlistRemaining = Math.max(0, optInTarget - optInCount)
  const promotionCount = Math.max(1, Math.ceil((data?.standings.length ?? 0) * 0.1))
  const completedMissions = data?.missions.filter((mission) => mission.completed).length ?? 0
  const showCrazyGate = Boolean(data?.crazyGateBlocked) || blockedByCrazyGate

  return (
    <ClientShell title="Consistency League">
      <div className={styles.page}>
        {error && (
          <div role="alert" style={{ padding: 12, borderRadius: 12, background: colors.dangerMuted, color: colors.danger, fontSize: 14 }}>
            {error}
          </div>
        )}

        <section className={styles.hero} aria-labelledby="league-rank-heading">
          <p className={styles.eyebrow}>
            {roomOpen
              ? `Monthly league · ${daysRemaining} days left`
              : `League room opens at ${optInTarget} members · ${optInCount} joined`}
          </p>
          <h1 id="league-rank-heading" className={styles.heroTitle}>{LEAGUE_TIER_LABELS[tier]}</h1>
          <p className={styles.heroSub}>
            {LEAGUE_TIER_DETAILS[tier].short}. Top 10% this month advance to the next league.
          </p>
          {showCrazyGate && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 14px',
                borderRadius: 12,
                border: `1px solid ${colors.borderSubtle}`,
                background: 'rgba(249,115,22,0.08)',
                fontSize: 13,
                lineHeight: 1.45,
                color: colors.textSecondary,
              }}
            >
              <strong style={{ color: colors.textPrimary }}>Free league entry.</strong>{' '}
              {CRAZY_GATE_COPY.long}{' '}
              <Link href={CRAZY_GATE_COPY.upgradeHref} style={{ color: colors.accent, fontWeight: 700 }}>
                {CRAZY_GATE_COPY.upgradeCta} →
              </Link>
            </div>
          )}

          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <strong>{data?.me?.points ?? 0}</strong>
              <span>Season points</span>
            </div>
            <div className={styles.heroStat}>
              <strong>{data?.me?.rank ? `#${data.me.rank}` : '—'}</strong>
              <span>Squad rank</span>
            </div>
            <div className={styles.heroStat}>
              <strong>{data?.me?.streakDays ?? 0}d</strong>
              <span>Momentum</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 7, fontSize: 11, fontWeight: 700 }}>
              <span>{LEAGUE_TIER_LABELS[tier]}</span>
              <span style={{ color: colors.textMuted }}>
                {blockedByCrazyGate
                  ? 'Crazy League locked · 12-month plan required'
                  : nextDivision
                    ? pointsNeeded != null
                      ? `${pointsNeeded} pts to top 10% → ${LEAGUE_TIER_LABELS[nextDivision]}`
                      : `Top 10% advance to ${LEAGUE_TIER_LABELS[nextDivision]}`
                    : 'Highest playable league — World board coming soon'}
              </span>
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label={nextDivision ? `Progress toward promotion to ${LEAGUE_TIER_LABELS[nextDivision]}` : 'Promotion zone'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(rankProgress)}
            >
              <div className={styles.progressFill} style={{ width: `${rankProgress}%` }} />
            </div>
          </div>
        </section>

        <section aria-labelledby="rank-path-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="rank-path-heading">League ladder</h2>
              <p>Each league lasts one month · top 10% promote</p>
            </div>
            <Shield size={21} color={LEAGUE_TIER_DETAILS[tier].color} aria-hidden />
          </div>
          <div className={styles.rankPath}>
            {LEAGUE_TIER_ORDER.map((rankTier) => {
              const playableIndex = LEAGUE_LADDER.indexOf(rankTier === 'world' ? 'crazy_3' : rankTier)
              const stateClass =
                rankTier === 'world'
                  ? ''
                  : playableIndex === tierIndex
                    ? styles.rankNodeActive
                    : playableIndex < tierIndex
                      ? styles.rankNodePassed
                      : ''
              return (
                <div key={rankTier} className={`${styles.rankNode} ${stateClass}`}>
                  <div className={styles.rankBadge}>
                    <span><Trophy size={18} aria-hidden /></span>
                  </div>
                  <span className={styles.rankLabel}>
                    {LEAGUE_TIER_LABELS[rankTier]}
                    {rankTier === 'world' ? ' · soon' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="rewards-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="rewards-heading">Rewards</h2>
              <p>{LEAGUE_TIER_DETAILS[tier].reward}</p>
            </div>
            <LockKeyhole size={20} color={colors.textMuted} aria-hidden />
          </div>
          <div className={styles.board}>
            <div style={{ padding: 14, display: 'grid', gap: 10, fontSize: 13, color: colors.textSecondary, lineHeight: 1.45 }}>
              <div><strong style={{ color: colors.textPrimary }}>Free with every plan:</strong> Consistency League entry — climb for certificates and trophies</div>
              <div><strong style={{ color: colors.textPrimary }}>Bronze → Gold:</strong> virtual certificate for top 10%</div>
              <div><strong style={{ color: colors.textPrimary }}>Platinum &amp; Diamond:</strong> physical trophy for top 10%</div>
              <div>
                <strong style={{ color: colors.textPrimary }}>Crazy 1–3:</strong> prize money up to ₹5,000 for top 10%
                {' · '}
                <span style={{ color: colors.accent, fontWeight: 700 }}>12-month plan required</span>
              </div>
              <div><strong style={{ color: colors.accent }}>World Leaderboard:</strong> coming soon</div>
            </div>
          </div>
        </section>

        <section aria-labelledby="mission-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="mission-heading">Missions</h2>
              <p>{completedMissions}/{data?.missions.length ?? 0} complete · based on real activity</p>
            </div>
            <Target size={21} color={colors.accent} aria-hidden />
          </div>
          <div className={styles.missionGrid}>
            {(data?.missions ?? []).map((mission) => (
              <Link
                key={mission.id}
                href={mission.href}
                className={`${styles.mission} ${mission.completed ? styles.missionDone : ''}`}
                aria-label={`${mission.title}: ${mission.completed ? 'complete' : `${mission.progress} of ${mission.target}`}`}
              >
                <span className={styles.missionIcon}>{missionIcon(mission.id)}</span>
                <span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <h3>{mission.title}</h3>
                    <span style={{ color: colors.textMuted, fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>{mission.cadence}</span>
                  </span>
                  <p>{mission.description}<br />{mission.pointsHint}</p>
                </span>
                <span className={styles.missionProgress}>
                  {mission.completed ? <CheckCircle2 size={21} aria-hidden /> : `${mission.progress}/${mission.target}`}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="standings-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="standings-heading">Season board</h2>
              <p>
                {!roomOpen
                  ? `Need ${waitlistRemaining} more member${waitlistRemaining === 1 ? '' : 's'} to open the league room`
                  : data?.optIn
                    ? 'Green edge marks the top 10% promotion zone'
                    : 'Private until you choose to join'}
              </p>
            </div>
            <Users size={21} color={colors.accent} aria-hidden />
          </div>

          {!data?.coachId ? (
            <EmptyBoard icon={<Info size={22} />} text="A coach assignment is needed before a squad league can form." />
          ) : !roomOpen ? (
            <div className={styles.board}>
              <EmptyBoard
                icon={<Users size={24} />}
                text={`The league room stays closed until ${optInTarget} members opt in. ${optInCount} / ${optInTarget} have joined.`}
              />
              <div style={{ padding: '0 14px 14px' }}>
                {data.optIn ? (
                  <Button fullWidth variant="ghost" loading={saving} onClick={() => void toggleOptIn(false)}>
                    Leave the waitlist
                  </Button>
                ) : (
                  <Button fullWidth loading={saving} onClick={() => void toggleOptIn(true)}>
                    Opt in — {waitlistRemaining} more to open
                  </Button>
                )}
              </div>
            </div>
          ) : !data.optIn ? (
            <div className={styles.board}>
              <EmptyBoard
                icon={<LockKeyhole size={24} />}
                text="Your points stay private. Join to see first name + last initial standings for your coach’s squad."
              />
              <div style={{ padding: '0 14px 14px' }}>
                <Button fullWidth loading={saving} onClick={() => void toggleOptIn(true)}>
                  Join this season
                </Button>
              </div>
            </div>
          ) : data.standings.length === 0 ? (
            <EmptyBoard icon={<Sparkles size={23} />} text="You’re first to arrive. Keep logging while your squad forms." />
          ) : (
            <div className={styles.board}>
              {data.standings.map((row) => (
                <div
                  key={row.clientId}
                  className={[
                    styles.boardRow,
                    row.isSelf ? styles.boardRowSelf : '',
                    row.promotionZone || row.rank <= promotionCount ? styles.promotionRow : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className={styles.rankNumber}>{row.rank <= 3 ? rankMark(row.rank) : `#${row.rank}`}</span>
                  <span style={{ minWidth: 0 }}>
                    <p className={styles.boardName}>{row.displayName}{row.isSelf ? ' · you' : ''}</p>
                    <p className={styles.boardMeta}>{LEAGUE_TIER_LABELS[row.tier]} · {row.streakDays}d momentum</p>
                  </span>
                  <span className={styles.points}>{row.points} <span style={{ color: colors.textMuted, fontSize: 10 }}>pts</span></span>
                </div>
              ))}
            </div>
          )}

          {data?.optIn && roomOpen && (
            <Button fullWidth variant="ghost" loading={saving} style={{ marginTop: 8 }} onClick={() => void toggleOptIn(false)}>
              Leave public standings
            </Button>
          )}
        </section>

        <section aria-labelledby="scoring-heading">
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="scoring-heading">How points work</h2>
              <p>Effort and follow-through only — never body metrics</p>
            </div>
            <Info size={20} color={colors.textMuted} aria-hidden />
          </div>
          <div className={styles.explainGrid}>
            <ScoreRule title="Daily tracker" detail="10% completed = 1 pt, up to 10 each day" value={data?.me?.breakdown?.tracker} />
            <ScoreRule title="Check-ins" detail="Mid-week +5 · weekly +8" value={data?.me?.breakdown?.checkins} />
            <ScoreRule title="Progress photo" detail="+2 for each photo day" value={data?.me?.breakdown?.photos} />
            <ScoreRule title="Momentum" detail="+1 per active streak day, up to +7" value={data?.me?.breakdown?.streak} />
          </div>
        </section>

        <div className={styles.privacy}>
          <strong style={{ color: colors.textPrimary }}>Privacy stays in your control.</strong> League participation is optional.
          The board shows only first name and last initial inside your coach’s squad. Weight, measurements, photos, and tracker details are never shown.
          {' '}The league room opens when {LEAGUE_ROOM_MIN_OPT_INS} members opt in. Use the join or leave control above to manage participation.
        </div>
      </div>
    </ClientShell>
  )
}

function remainingDays(endsOn: string): number {
  const end = new Date(`${endsOn}T23:59:59.999Z`).getTime()
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000))
}

function missionIcon(id: LeagueMission['id']) {
  if (id === 'daily-log') return <ListChecks size={20} aria-hidden />
  if (id === 'three-day-rhythm') return <Flame size={20} aria-hidden />
  if (id === 'weekly-checkin') return <ClipboardCheck size={20} aria-hidden />
  return <Camera size={20} aria-hidden />
}

function rankMark(rank: number): string {
  if (rank === 1) return '◆'
  if (rank === 2) return '◇'
  return '△'
}

function EmptyBoard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted }}>
      <div style={{ color: colors.accent, marginBottom: 8 }}>{icon}</div>
      <p style={{ margin: '0 auto', maxWidth: 360, fontSize: 13, lineHeight: 1.5 }}>{text}</p>
    </div>
  )
}

function ScoreRule({ title, detail, value }: { title: string; detail: string; value?: number }) {
  return (
    <div className={styles.explainItem}>
      <strong>{title}{value != null ? <span style={{ float: 'right', color: colors.accent }}>{value} pts</span> : null}</strong>
      <span>{detail}</span>
    </div>
  )
}
