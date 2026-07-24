import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  assignDivisionStandings,
  getCurrentLeagueSeason,
  getLeagueMissions,
  leagueDisplayName,
  normalizeLeagueTier,
  scoreClientForSeason,
  type LeagueClientScoreInput,
  type LeagueMission,
  type LeagueStandingRow,
  type LeagueTier,
} from '@/lib/league/scoring'

async function ensureSeason(
  admin: ReturnType<typeof createAdminClient>,
  season = getCurrentLeagueSeason()
): Promise<{ id: string; startsOn: string; endsOn: string; seasonKey: string }> {
  const { data: existing } = await admin
    .from('league_seasons')
    .select('id, season_key, starts_on, ends_on')
    .eq('season_key', season.seasonKey)
    .maybeSingle()

  if (existing) {
    return {
      id: existing.id as string,
      seasonKey: existing.season_key as string,
      startsOn: existing.starts_on as string,
      endsOn: existing.ends_on as string,
    }
  }

  const { data: created, error } = await admin
    .from('league_seasons')
    .insert({
      season_key: season.seasonKey,
      starts_on: season.startsOn,
      ends_on: season.endsOn,
    })
    .select('id, season_key, starts_on, ends_on')
    .single()

  if (error || !created) {
    throw new Error(error?.message ?? 'Failed to create league season')
  }

  return {
    id: created.id as string,
    seasonKey: created.season_key as string,
    startsOn: created.starts_on as string,
    endsOn: created.ends_on as string,
  }
}

async function loadClientLeagueInput(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  displayName: string,
  season: { startsOn: string; endsOn: string }
): Promise<LeagueClientScoreInput> {
  const [trackerResult, checkinResult, journeyResult] = await Promise.all([
    admin
      .from('daily_tracker_days')
      .select('log_date, overall_percent')
      .eq('client_id', clientId)
      .gte('log_date', season.startsOn)
      .lte('log_date', season.endsOn),
    admin
      .from('checkins')
      .select('checkin_type, submitted_at, chest, thigh, navel')
      .eq('client_id', clientId)
      .gte('submitted_at', `${season.startsOn}T00:00:00.000Z`)
      .lte('submitted_at', `${season.endsOn}T23:59:59.999Z`),
    admin
      .from('journey_entries')
      .select('entry_date, photo_front, photo_side, photo_back, extra_photos')
      .eq('client_id', clientId)
      .gte('entry_date', season.startsOn)
      .lte('entry_date', season.endsOn),
  ])

  const firstError = trackerResult.error ?? checkinResult.error ?? journeyResult.error
  if (firstError) throw new Error(firstError.message)

  return {
    clientId,
    displayName,
    trackerDays: (trackerResult.data ?? []).map((entry) => ({
      logDate: entry.log_date as string,
      overallPercent: (entry.overall_percent as number | null) ?? null,
    })),
    checkins: (checkinResult.data ?? []).map((entry) => ({
      checkinType: entry.checkin_type as string,
      submittedAt: entry.submitted_at as string,
      hasMeasurements: Boolean(entry.chest && entry.thigh && entry.navel),
    })),
    journeyPhotoDays: (journeyResult.data ?? [])
      .filter((entry) => {
        const extras = Array.isArray(entry.extra_photos) ? entry.extra_photos : []
        return Boolean(entry.photo_front || entry.photo_side || entry.photo_back || extras.length > 0)
      })
      .map((entry) => entry.entry_date as string),
  }
}

export async function recomputeCoachLeagueStandings(coachId: string): Promise<{
  seasonKey: string
  startsOn: string
  endsOn: string
  standings: LeagueStandingRow[]
}> {
  const admin = createAdminClient()
  const seasonRow = await ensureSeason(admin)
  const season = {
    seasonKey: seasonRow.seasonKey,
    startsOn: seasonRow.startsOn,
    endsOn: seasonRow.endsOn,
  }

  const { data: clients, error: clientsError } = await admin
    .from('profiles')
    .select('id, name, league_opt_in, league_division, avatar_path')
    .eq('coach_id', coachId)
    .eq('league_opt_in', true)

  if (clientsError) throw new Error(clientsError.message)

  const roster = clients ?? []
  if (roster.length === 0) {
    const { error: deleteError } = await admin
      .from('league_standings')
      .delete()
      .eq('season_id', seasonRow.id)
      .eq('coach_id', coachId)
    if (deleteError) throw new Error(deleteError.message)
    return { ...season, standings: [] }
  }

  const clientIds = roster.map((c) => c.id as string)

  const [trackerResult, checkinResult, journeyResult] = await Promise.all([
    admin
      .from('daily_tracker_days')
      .select('client_id, log_date, overall_percent')
      .in('client_id', clientIds)
      .gte('log_date', season.startsOn)
      .lte('log_date', season.endsOn),
    admin
      .from('checkins')
      .select('client_id, checkin_type, submitted_at, chest, thigh, navel')
      .in('client_id', clientIds)
      .gte('submitted_at', `${season.startsOn}T00:00:00.000Z`)
      .lte('submitted_at', `${season.endsOn}T23:59:59.999Z`),
    admin
      .from('journey_entries')
      .select('client_id, entry_date, photo_front, photo_side, photo_back, extra_photos')
      .in('client_id', clientIds)
      .gte('entry_date', season.startsOn)
      .lte('entry_date', season.endsOn),
  ])

  const scoringError = trackerResult.error ?? checkinResult.error ?? journeyResult.error
  if (scoringError) throw new Error(scoringError.message)

  const trackerDays = trackerResult.data ?? []
  const checkins = checkinResult.data ?? []
  const journeys = journeyResult.data ?? []

  const scored = roster.map((client) => {
    const id = client.id as string
    const result = scoreClientForSeason(
      {
        clientId: id,
        displayName: leagueDisplayName(client.name as string | null),
        trackerDays: trackerDays
          .filter((d) => d.client_id === id)
          .map((d) => ({
            logDate: d.log_date as string,
            overallPercent: (d.overall_percent as number | null) ?? null,
          })),
        checkins: checkins
          .filter((c) => c.client_id === id)
          .map((c) => ({
            checkinType: c.checkin_type as string,
            submittedAt: c.submitted_at as string,
            hasMeasurements: Boolean(c.chest && c.thigh && c.navel),
          })),
        journeyPhotoDays: journeys
          .filter((j) => j.client_id === id)
          .filter((j) => {
            const extras = Array.isArray(j.extra_photos) ? j.extra_photos : []
            return Boolean(j.photo_front || j.photo_side || j.photo_back || extras.length > 0)
          })
          .map((j) => j.entry_date as string),
      },
      season
    )

    return {
      clientId: id,
      displayName: leagueDisplayName(client.name as string | null),
      points: result.points,
      streakDays: result.streakDays,
      breakdown: result.breakdown,
      division: normalizeLeagueTier(client.league_division as string | null),
      avatarPath: (client.avatar_path as string | null) ?? null,
    }
  })

  // Rank within each division so top 10% promote fairly.
  const byDivision = new Map<LeagueTier, typeof scored>()
  for (const row of scored) {
    const list = byDivision.get(row.division) ?? []
    list.push(row)
    byDivision.set(row.division, list)
  }

  const standings: LeagueStandingRow[] = []
  for (const [division, rows] of byDivision) {
    rows.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))
    const assigned = assignDivisionStandings(rows, division)
    rows.forEach((row, index) => {
      standings.push({
        clientId: row.clientId,
        displayName: row.displayName,
        points: row.points,
        streakDays: row.streakDays,
        breakdown: row.breakdown,
        tier: assigned[index].tier,
        promotionZone: assigned[index].promotionZone,
        rank: index + 1,
        avatarPath: row.avatarPath,
      })
    })
  }

  standings.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))

  const now = new Date().toISOString()
  const upserts = standings.map((row) => ({
    season_id: seasonRow.id,
    client_id: row.clientId,
    coach_id: coachId,
    points: row.points,
    streak_days: row.streakDays,
    tier: row.tier,
    rank: row.rank,
    updated_at: now,
  }))

  const { error: deleteError } = await admin
    .from('league_standings')
    .delete()
    .eq('season_id', seasonRow.id)
    .eq('coach_id', coachId)
  if (deleteError) throw new Error(deleteError.message)
  if (upserts.length > 0) {
    const { error } = await admin.from('league_standings').insert(upserts)
    if (error) throw new Error(error.message)
  }

  return { ...season, standings }
}

export async function getLeagueSnapshotForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<{
  optIn: boolean
  seasonKey: string
  startsOn: string
  endsOn: string
  me: LeagueStandingRow | null
  standings: LeagueStandingRow[]
  coachId: string | null
  missions: LeagueMission[]
  division: LeagueTier
  worldLeaderboardStatus: 'coming_soon'
}> {
  const season = getCurrentLeagueSeason()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, coach_id, league_opt_in, league_division, avatar_path')
    .eq('id', clientId)
    .maybeSingle()

  const myDivision = normalizeLeagueTier(profile?.league_division as string | null)

  if (!profile?.coach_id) {
    return {
      optIn: false,
      seasonKey: season.seasonKey,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      me: null,
      standings: [],
      coachId: null,
      missions: [],
      division: myDivision,
      worldLeaderboardStatus: 'coming_soon' as const,
    }
  }

  const recomputed = await recomputeCoachLeagueStandings(profile.coach_id as string)
  const divisionStandings = recomputed.standings
    .filter((row) => row.tier === myDivision)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      isSelf: row.clientId === clientId,
    }))

  let me =
    divisionStandings.find((s) => s.clientId === clientId) ??
    (profile.league_opt_in
      ? null
      : {
          clientId,
          displayName: leagueDisplayName(profile.name as string | null),
          points: 0,
          streakDays: 0,
          tier: myDivision,
          rank: 0,
          isSelf: true,
          avatarPath: (profile.avatar_path as string | null) ?? null,
        })

  const admin = createAdminClient()
  const displayName = leagueDisplayName(profile.name as string | null)
  const personalInput = await loadClientLeagueInput(admin, clientId, displayName, season)
  const personal = scoreClientForSeason(personalInput, season)
  const missions = getLeagueMissions(personalInput, season)

  if (!profile.league_opt_in) {
    return {
      optIn: false,
      seasonKey: recomputed.seasonKey,
      startsOn: recomputed.startsOn,
      endsOn: recomputed.endsOn,
      me: {
        clientId,
        displayName,
        points: personal.points,
        streakDays: personal.streakDays,
        tier: myDivision,
        rank: 0,
        isSelf: true,
        breakdown: personal.breakdown,
        avatarPath: (profile.avatar_path as string | null) ?? null,
      },
      standings: [],
      coachId: profile.coach_id as string,
      missions,
      division: myDivision,
      worldLeaderboardStatus: 'coming_soon' as const,
    }
  }

  if (me) {
    me = {
      ...me,
      breakdown: personal.breakdown,
      avatarPath: me.avatarPath ?? ((profile.avatar_path as string | null) ?? null),
    }
  }

  return {
    optIn: true,
    seasonKey: recomputed.seasonKey,
    startsOn: recomputed.startsOn,
    endsOn: recomputed.endsOn,
    me: me ?? null,
    standings: divisionStandings,
    coachId: profile.coach_id as string,
    missions,
    division: myDivision,
    worldLeaderboardStatus: 'coming_soon' as const,
  }
}
