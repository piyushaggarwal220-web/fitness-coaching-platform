/** Consistency League — points from tracker adherence + on-time check-ins. */

export type LeagueTier = 'foundation' | 'steady' | 'momentum' | 'champion'

export const LEAGUE_TIER_ORDER: LeagueTier[] = ['foundation', 'steady', 'momentum', 'champion']

export const LEAGUE_TIER_LABELS: Record<LeagueTier, string> = {
  foundation: 'Ember Camp',
  steady: 'Iron Trail',
  momentum: 'Summit Guard',
  champion: 'Apex Vanguard',
}

export const LEAGUE_TIER_DETAILS: Record<LeagueTier, { short: string; color: string }> = {
  foundation: { short: 'Build your base', color: '#fb923c' },
  steady: { short: 'Consistency takes hold', color: '#a3a3a3' },
  momentum: { short: 'Momentum is visible', color: '#facc15' },
  champion: { short: 'Lead by example', color: '#c084fc' },
}

export type LeagueScoreBreakdown = {
  tracker: number
  checkins: number
  photos: number
  streak: number
}

export type LeagueMission = {
  id: 'daily-log' | 'three-day-rhythm' | 'weekly-checkin' | 'progress-memory'
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
  checkins: Array<{ checkinType: string; submittedAt: string }>
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
}

/** 4-week seasons aligned to Monday starts (UTC date strings). */
export function getCurrentLeagueSeason(reference = new Date()): LeagueSeasonWindow {
  const utc = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()))
  const day = utc.getUTCDay() // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day
  utc.setUTCDate(utc.getUTCDate() + mondayOffset)

  // Pack Mondays into blocks of 4 weeks from a fixed epoch Monday.
  const epoch = Date.UTC(2026, 0, 5) // 2026-01-05 was a Monday
  const weeksSinceEpoch = Math.floor((utc.getTime() - epoch) / (7 * 24 * 60 * 60 * 1000))
  const block = Math.floor(weeksSinceEpoch / 4)
  const start = new Date(epoch + block * 4 * 7 * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + (4 * 7 - 1) * 24 * 60 * 60 * 1000)

  const startsOn = start.toISOString().slice(0, 10)
  const endsOn = end.toISOString().slice(0, 10)
  return {
    seasonKey: `S${startsOn}`,
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

/**
 * Consecutive calendar-day streak ending today (or last scored day)
 * for days with overall_percent >= 60.
 */
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

/** Streak bonus: +1 per consecutive qualifying day, max +7 per week of season. */
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
    else if (c.checkinType === 'weekly') checkins += 8
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

export function assignTiers(sortedByPointsDesc: { points: number }[]): LeagueTier[] {
  const n = sortedByPointsDesc.length
  if (n === 0) return []
  return sortedByPointsDesc.map((_, index) => {
    const percentile = n === 1 ? 1 : 1 - index / (n - 1)
    if (percentile >= 0.95 || index === 0 && n >= 5) return 'champion'
    if (percentile >= 0.75) return 'momentum'
    if (percentile >= 0.4) return 'steady'
    return 'foundation'
  })
}

export function leagueDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return 'Athlete'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase()}.`
}

export function pointsToNextTier(tier: LeagueTier, points: number, standings: LeagueStandingRow[]): number | null {
  const idx = LEAGUE_TIER_ORDER.indexOf(tier)
  if (idx < 0 || idx >= LEAGUE_TIER_ORDER.length - 1) return null
  const next = LEAGUE_TIER_ORDER[idx + 1]
  const nextFloor = standings
    .filter((s) => s.tier === next)
    .map((s) => s.points)
    .sort((a, b) => a - b)[0]
  if (nextFloor == null) return null
  return Math.max(0, nextFloor - points)
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
      .filter((entry) => (
        entry.logDate >= weekStart &&
        entry.logDate <= weekEndKey &&
        (entry.overallPercent ?? 0) >= 60
      ))
      .map((entry) => entry.logDate)
  )
  const todayPercent = input.trackerDays.find((entry) => entry.logDate === today)?.overallPercent ?? 0
  const weeklyCheckinDone = input.checkins.some((entry) => (
    entry.checkinType === 'weekly' &&
    entry.submittedAt.slice(0, 10) >= weekStart &&
    entry.submittedAt.slice(0, 10) <= weekEndKey &&
    dateInRange(entry.submittedAt.slice(0, 10), season.startsOn, season.endsOn)
  ))
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
      description: 'Submit a weekly check-in this week.',
      cadence: 'Weekly',
      progress: weeklyCheckinDone ? 1 : 0,
      target: 1,
      completed: weeklyCheckinDone,
      href: '/checkin',
      pointsHint: 'Weekly check-in adds 8 pts',
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
