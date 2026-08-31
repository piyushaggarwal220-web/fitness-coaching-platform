'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { Camera, ChevronRight, Trophy } from 'lucide-react'
import { StorageImage } from '@/components/ui/StorageImage'
import {
  LEAGUE_TIER_DETAILS,
  LEAGUE_TIER_LABELS,
  normalizeLeagueTier,
  pointsToNextTier,
  type LeagueStandingRow,
  type LeagueTier,
} from '@/lib/league/scoring'
import styles from '@/app/profile/profile.module.css'

type ProfilePlayerHeroProps = {
  name: string
  email: string
  avatarPath: string | null
  uploadingAvatar: boolean
  onAvatarPick: (file: File | null) => void
  leagueMe: LeagueStandingRow | null
  leagueOptIn: boolean
  rankProgress: number
  pointsLabel: string
}

export function ProfilePlayerHero({
  name,
  email,
  avatarPath,
  uploadingAvatar,
  onAvatarPick,
  leagueMe,
  leagueOptIn,
  rankProgress,
  pointsLabel,
}: ProfilePlayerHeroProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const tier = normalizeLeagueTier(leagueMe?.tier ?? 'bronze') as LeagueTier
  const tierColor = LEAGUE_TIER_DETAILS[tier].color

  const initial = (name?.[0] ?? email?.[0] ?? 'U').toUpperCase()

  return (
    <section
      className={styles.hero}
      style={{ ['--tier-color' as string]: tierColor }}
    >
      <div className={styles.heroTop}>
        <div className={styles.avatarWrap}>
          <div className={styles.avatarRing}>
            <button
              type="button"
              className={styles.avatarBtn}
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Upload profile photo"
            >
              {avatarPath ? (
                <StorageImage
                  bucket="avatars"
                  src={avatarPath}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                initial
              )}
            </button>
          </div>
          <span className={styles.avatarBadge} aria-hidden>
            <Camera size={14} />
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onAvatarPick(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className={styles.heroMeta}>
          <p className={styles.eyebrow}>Your player card</p>
          <h1 className={styles.playerName}>{name || 'Athlete'}</h1>
          <p className={styles.playerEmail}>{email}</p>
          <span className={styles.tierPill}>
            <Trophy size={14} color={tierColor} />
            {LEAGUE_TIER_LABELS[tier]}
            {leagueOptIn && leagueMe?.rank ? ` · #${leagueMe.rank}` : ''}
          </span>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <strong>{leagueMe?.points ?? 0}</strong>
          <span>Season pts</span>
        </div>
        <div className={styles.stat}>
          <strong>{leagueMe?.streakDays ?? 0}</strong>
          <span>Streak</span>
        </div>
        <div className={styles.stat}>
          <strong>{leagueMe?.rank ? `#${leagueMe.rank}` : '—'}</strong>
          <span>Squad rank</span>
        </div>
      </div>

      <div className={styles.progressWrap}>
        <div className={styles.progressLabel}>
          <span>{pointsLabel}</span>
          <span>{Math.round(rankProgress)}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${rankProgress}%` }} />
        </div>
      </div>

      <Link
        href="/league"
        className={styles.heroCta}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          textDecoration: 'none',
        }}
      >
        Open Consistency League
        <ChevronRight size={16} />
      </Link>
    </section>
  )
}
