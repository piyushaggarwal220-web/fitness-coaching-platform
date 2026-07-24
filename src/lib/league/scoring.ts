/** Consistency League — monthly seasons, ladder divisions, top 10% promote. */

export type LeagueTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'crazy_1'
  | 'crazy_2'
  | 'crazy_3'
  | 'world'

/** Playable ladder (world is display-only / coming soon). */
export const LEAGUE_LADDER: LeagueTier[] = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'crazy_1',
  'crazy_2',
  'crazy_3',
]

export const LEAGUE_TIER_ORDER: LeagueTier[] = [...LEAGUE_LADDER, 'world']

export const LEAGUE_TIER_LABELS: Record<LeagueTier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  crazy_1: 'Crazy 1',
  crazy_2: 'Crazy 2',
  crazy_3: 'Crazy 3',
  world: 'World Leaderboard',
}

export const LEAGUE_TIER_DETAILS: Record<
  LeagueTier,
  { short: string; color: string; reward: string }
> = {
  bronze: {
    short: 'Start strong',
    color: '#fb923c',
    reward: 'Top 10% earn a virtual certificate and advance to Silver',
  },
  silver: {
    short: 'Consistency grows',
    color: '#a3a3a3',
    reward: 'Top 10% earn a virtual certificate and advance to Gold',
  },
  gold: {
    short: 'Elite habit',
    color: '#facc15',
    reward: 'Top 10% earn a virtual certificate and advance to Platinum',
  },
  platinum: {
    short: 'Trophy territory',
    color: '#e5e7eb',
    reward: 'Top 10% win a physical trophy and advance to Diamond',
  },
  diamond: {
    short: 'Champion form',
    color: '#67e8f9',
    reward: 'Top 10% win a physical trophy and advance to Crazy 1',
  },
  crazy_1: {
    short: 'Prize money tier',
    color: '#f472b6',
    reward: 'Top 10% earn prize money and advance to Crazy 2',
  },
  crazy_2: {
    short: 'Higher stakes',
    color: '#c084fc',
    reward: 'Top 10% earn prize money and advance to Crazy 3',
  },
  crazy_3: {
    short: 'Final arena',
    color: '#ef4444',
    reward: 'Top 10% earn prize money — World Leaderboard coming soon',
  },
  world: {
    short: 'Coming soon',
    color: '#38bdf8',
    reward: 'Global board — launching soon',
  },
}

export type LeagueScoreBreakdown = {
  tracker: number
  checkins: number
  photos: number
  streak: number
}

export type LeagueMission = {
  id: 'daily-log' | 'three-day-rhythm' | 'weekly-checkin' | 'progress-memory' | 'body-tape'
  title: string
  description: string
  cadence: 'Daily' | 'Weekly' | 'Season'
  progress: number
  target: number
  completed: boolean
  href: string
  pointsHint: string
}

export type LeagueSeasonWindow = {
  seasonKey: string
  startsOn: string
  endsOn: string
}

export type LeagueClientScoreInput = {
  clientId: string
  displayName: string
  trackerDays: Array<{ logDate: string; overallPercent: number | null }>
  checkins: Array<{ checkinType: string; submittedAt: string; hasMeasurements?: boolean }>
  journeyPhotoDays: string[]
}

export type LeagueStandingRow = {
  clientId: string
  displayName: string
  points: number
  streakDays: number
  tier: LeagueTier
  rank: number
  isSelf?: boolean
  breakdown?: LeagueScoreBreakdown
  avatarPath?: string | null
  promotionZone?: boolean
}

/** Calendar-month seasons (UTC). */
export function getCurrentLeagueSeason(reference = new Date()): LeagueSeasonWindow {
  const y = reference.getUTCFullYear()
  const m = reference.getUTCMonth()
  const start = new Date(Date.UTC(y, m, 1))
  const end = new Date(Date.UTC(y, m + 1, 0))
  const startsOn = start.toISOString().slice(0, 10)
  const endsOn = end.toISOString().slice(0, 10)
  return {
    seasonKey: `${y}-${String(m + 1).padStart(2, '0')}`,
    startsOn,
    endsOn,
  }
}

export function dateInRange(date: string, startsOn: string, endsOn: string): boolean {
  return date >= startsOn && date <= endsOn
}

function eachDateInclusive(startsOn: string, endsOn: string): string[] {
  const out: string[] = []
  const cursor = new Date(`${startsOn}T00:00:00.000Z`)
  const end = new Date(`${endsOn}T00:00:00.000Z`)
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/** Daily tracker points: floor(percent/10), missing day = 0. Max 10/day. */
export function dailyTrackerPoints(overallPercent: number | null | undefined): number {
  if (overallPercent == null || !Number.isFinite(overallPercent)) return 0
  return Math.max(0, Math.min(10, Math.floor(overallPercent / 10)))
}

export function computeCalendarStreak(
  trackerByDate: Map<string, number | null>,
  endsOn: string
): number {
  let streak = 0
  const cursor = new Date(`${endsOn}T00:00:00.000Z`)
  for (let i = 0; i < 60; i++) {
    const key = cursor.toISOString().slice(0, 10)
    const pct = trackerByDate.get(key)
    if (pct != null && pct >= 60) {
      streak++
      cursor.setUTCDate(cursor.getUTCDate() - 1)
      continue
    }
    break
  }
  return streak
}

export function streakBonusPoints(streakDays: number, seasonDayCount: number): number {
  const weekCap = Math.ceil(seasonDayCount / 7) * 7
  return Math.min(streakDays, weekCap, 7 * Math.ceil(seasonDayCount / 7))
}

export function scoreClientForSeason(
  input: LeagueClientScoreInput,
  season: LeagueSeasonWindow
): { points: number; streakDays: number; breakdown: LeagueScoreBreakdown } {
  const trackerByDate = new Map<string, number | null>()
  for (const day of input.trackerDays) {
    if (dateInRange(day.logDate, season.startsOn, season.endsOn)) {
      trackerByDate.set(day.logDate, day.overallPercent)
    }
  }

  let tracker = 0
  for (const date of eachDateInclusive(season.startsOn, season.endsOn)) {
    tracker += dailyTrackerPoints(trackerByDate.get(date) ?? null)
  }

  let checkins = 0
  for (const c of input.checkins) {
    const day = c.submittedAt.slice(0, 10)
    if (!dateInRange(day, season.startsOn, season.endsOn)) continue
    if (c.checkinType === 'mid_week') checkins += 5
    else if (c.checkinType === 'weekly') {
      checkins += 8
      if (c.hasMeasurements) checkins += 3
    }
  }

  let photos = 0
  const seenPhotoDays = new Set<string>()
  for (const day of input.journeyPhotoDays) {
    if (!dateInRange(day, season.startsOn, season.endsOn)) continue
    if (seenPhotoDays.has(day)) continue
    seenPhotoDays.add(day)
    photos += 2
  }

  const today = new Date().toISOString().slice(0, 10)
  const streakEnd = today < season.endsOn ? today : season.endsOn
  const streakDays = computeCalendarStreak(trackerByDate, streakEnd)
  const streak = Math.min(7, streakDays)

  return {
    points: tracker + checkins + photos + streak,
    streakDays,
    breakdown: { tracker, checkins, photos, streak },
  }
}

/** Normalize legacy tier names stored before the ladder rename. */
export function normalizeLeagueTier(raw: string | null | undefined): LeagueTier {
  const value = (raw ?? 'bronze').toLowerCase()
  const legacy: Record<string, LeagueTier> = {
    foundation: 'bronze',
    steady: 'silver',
    momentum: 'gold',
    champion: 'platinum',
  }
  if (legacy[value]) return legacy[value]
  if ((LEAGUE_TIER_ORDER as string[]).includes(value)) return value as LeagueTier
  return 'bronze'
}

/**
 * Within a division standings list (already sorted by points desc),
 * mark every row with the same division tier and flag top 10% for promotion.
 */
export function assignDivisionStandings(
  sortedByPointsDesc: { points: number }[],
  division: LeagueTier
): Array<{ tier: LeagueTier; promotionZone: boolean }> {
  const n = sortedByPointsDesc.length
  if (n === 0) return []
  const promoteCount = Math.max(1, Math.ceil(n * 0.1))
  return sortedByPointsDesc.map((_, index) => ({
    tier: division,
    promotionZone: index < promoteCount,
  }))
}

/** @deprecated Use assignDivisionStandings — kept for callers during migration. */
export function assignTiers(sortedByPointsDesc: { points: number }[]): LeagueTier[] {
  return assignDivisionStandings(sortedByPointsDesc, 'bronze').map((row) => row.tier)
}

export function leagueDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return 'Athlete'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase()}.`
}

export function pointsToNextTier(
  tier: LeagueTier,
  points: number,
  standings: LeagueStandingRow[]
): number | null {
  const promoteFloor = standings
    .filter((s) => s.promotionZone)
    .map((s) => s.points)
    .sort((a, b) => a - b)[0]
  if (promoteFloor == null) return null
  if (standings.find((s) => s.tier === tier && s.promotionZone && s.points === points)) return 0
  return Math.max(0, promoteFloor - points)
}

export function nextLeagueDivision(current: LeagueTier): LeagueTier | null {
  const idx = LEAGUE_LADDER.indexOf(current)
  if (idx < 0 || idx >= LEAGUE_LADDER.length - 1) return null
  return LEAGUE_LADDER[idx + 1]
}

export function getLeagueMissions(
  input: LeagueClientScoreInput,
  season: LeagueSeasonWindow,
  reference = new Date()
): LeagueMission[] {
  const today = reference.toISOString().slice(0, 10)
  const monday = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()))
  const day = monday.getUTCDay()
  monday.setUTCDate(monday.getUTCDate() + (day === 0 ? -6 : 1 - day))
  const weekStart = monday.toISOString().slice(0, 10)
  const weekEnd = new Date(monday)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)
  const weekEndKey = weekEnd.toISOString().slice(0, 10)

  const qualifyingDays = new Set(
    input.trackerDays
      .filter(
        (entry) =>
          entry.logDate >= weekStart &&
          entry.logDate <= weekEndKey &&
          (entry.overallPercent ?? 0) >= 60
      )
      .map((entry) => entry.logDate)
  )
  const todayPercent = input.trackerDays.find((entry) => entry.logDate === today)?.overallPercent ?? 0
  const weeklyCheckinDone = input.checkins.some(
    (entry) =>
      entry.checkinType === 'weekly' &&
      entry.submittedAt.slice(0, 10) >= weekStart &&
      entry.submittedAt.slice(0, 10) <= weekEndKey &&
      dateInRange(entry.submittedAt.slice(0, 10), season.startsOn, season.endsOn)
  )
  const measurementsDone = input.checkins.some(
    (entry) =>
      entry.checkinType === 'weekly' &&
      entry.hasMeasurements &&
      dateInRange(entry.submittedAt.slice(0, 10), season.startsOn, season.endsOn)
  )
  const photoDone = input.journeyPhotoDays.some((entry) => dateInRange(entry, season.startsOn, season.endsOn))

  return [
    {
      id: 'daily-log',
      title: 'Light today’s beacon',
      description: 'Reach 60% on today’s tracker.',
      cadence: 'Daily',
      progress: Math.min(60, Math.max(0, todayPercent)),
      target: 60,
      completed: todayPercent >= 60,
      href: '/tracker',
      pointsHint: 'Tracker score contributes up to 10 pts today',
    },
    {
      id: 'three-day-rhythm',
      title: 'Hold the rhythm',
      description: 'Reach 60% on three different days this week.',
      cadence: 'Weekly',
      progress: Math.min(3, qualifyingDays.size),
      target: 3,
      completed: qualifyingDays.size >= 3,
      href: '/tracker',
      pointsHint: 'Builds tracker points and your streak bonus',
    },
    {
      id: 'weekly-checkin',
      title: 'Send the field report',
      description: 'Submit a weekly check-in with photos this week.',
      cadence: 'Weekly',
      progress: weeklyCheckinDone ? 1 : 0,
      target: 1,
      completed: weeklyCheckinDone,
      href: '/checkin',
      pointsHint: 'Weekly check-in +8 · photos +2/day',
    },
    {
      id: 'body-tape',
      title: 'Log the tape',
      description: 'Log chest, thigh, and navel measurements on a weekly check-in.',
      cadence: 'Season',
      progress: measurementsDone ? 1 : 0,
      target: 1,
      completed: measurementsDone,
      href: '/checkin',
      pointsHint: 'Full measurements add +3 pts',
    },
    {
      id: 'progress-memory',
      title: 'Mark the journey',
      description: 'Add a progress photo this season.',
      cadence: 'Season',
      progress: photoDone ? 1 : 0,
      target: 1,
      completed: photoDone,
      href: '/journey',
      pointsHint: 'First photo day adds 2 pts',
    },
  ]
}
