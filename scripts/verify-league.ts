import assert from 'node:assert/strict'
import {
  LEAGUE_TIER_LABELS,
  assignTiers,
  dailyTrackerPoints,
  getCurrentLeagueSeason,
  getLeagueMissions,
  leagueDisplayName,
  scoreClientForSeason,
} from '../src/lib/league/scoring'

const now = new Date()
const today = now.toISOString().slice(0, 10)
const yesterdayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
const yesterday = yesterdayDate.toISOString().slice(0, 10)
const season = getCurrentLeagueSeason(now)

assert.equal(dailyTrackerPoints(null), 0)
assert.equal(dailyTrackerPoints(59), 5)
assert.equal(dailyTrackerPoints(100), 10)
assert.equal(leagueDisplayName('Alex Morgan'), 'Alex M.')
assert.deepEqual(assignTiers([{ points: 100 }, { points: 75 }, { points: 50 }, { points: 10 }]), [
  'champion',
  'steady',
  'foundation',
  'foundation',
])
assert.deepEqual(LEAGUE_TIER_LABELS, {
  foundation: 'Bronze',
  steady: 'Silver',
  momentum: 'Gold',
  champion: 'Platinum',
})

const input = {
  clientId: 'test-client',
  displayName: 'Alex M.',
  trackerDays: [
    { logDate: yesterday, overallPercent: 60 },
    { logDate: today, overallPercent: 100 },
  ],
  checkins: [
    { checkinType: 'mid_week', submittedAt: `${today}T08:00:00.000Z` },
    { checkinType: 'weekly', submittedAt: `${today}T09:00:00.000Z` },
  ],
  journeyPhotoDays: [today, today],
}

const score = scoreClientForSeason(input, season)
assert.equal(score.breakdown.tracker, 16)
assert.equal(score.breakdown.checkins, 13)
assert.equal(score.breakdown.photos, 2)
assert.equal(score.streakDays, 2)
assert.equal(score.breakdown.streak, 2)
assert.equal(score.points, 33)

const missions = getLeagueMissions(input, season, now)
assert.equal(missions.find((mission) => mission.id === 'daily-log')?.completed, true)
assert.equal(missions.find((mission) => mission.id === 'weekly-checkin')?.completed, true)
assert.equal(missions.find((mission) => mission.id === 'progress-memory')?.completed, true)
assert.equal(missions.find((mission) => mission.id === 'three-day-rhythm')?.progress, 2)

console.log('League verification passed: scoring, privacy names, tiers, and mission progress')
