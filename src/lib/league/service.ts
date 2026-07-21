import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  assignTiers,
  getCurrentLeagueSeason,
  getLeagueMissions,
  leagueDisplayName,
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
      .select('checkin_type, submitted_at')
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
    .select('id, name, league_opt_in')
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
      .select('client_id, checkin_type, submitted_at')
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
    }
  })

  scored.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName))
  const tiers = assignTiers(scored)

  const standings: LeagueStandingRow[] = scored.map((row, index) => ({
    ...row,
    tier: tiers[index] as LeagueTier,
    rank: index + 1,
  }))

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

  // Replace coach season rows atomically enough for MVP.
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
}> {
  const season = getCurrentLeagueSeason()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, coach_id, league_opt_in')
    .eq('id', clientId)
    .maybeSingle()

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
    }
  }

  const recomputed = await recomputeCoachLeagueStandings(profile.coach_id as string)
  const standings = recomputed.standings.map((row) => ({
    ...row,
    isSelf: row.clientId === clientId,
  }))

  let me =
    standings.find((s) => s.clientId === clientId) ??
    (profile.league_opt_in
      ? null
      : {
          clientId,
          displayName: leagueDisplayName(profile.name as string | null),
          points: 0,
          streakDays: 0,
          tier: 'foundation' as LeagueTier,
          rank: 0,
          isSelf: true,
        })

  const admin = createAdminClient()
  const displayName = leagueDisplayName(profile.name as string | null)
  const personalInput = await loadClientLeagueInput(admin, clientId, displayName, season)
  const personal = scoreClientForSeason(personalInput, season)
  const missions = getLeagueMissions(personalInput, season)

  // Private members still receive a personal score without entering peer standings.
  if (!profile.league_opt_in) {
    return {
      optIn: false,
      seasonKey: recomputed.seasonKey,
      startsOn: recomputed.startsOn,
      endsOn: recomputed.endsOn,
      me: {
        clientId,
        displayName: leagueDisplayName(profile.name as string | null),
        points: personal.points,
        streakDays: personal.streakDays,
        tier: 'foundation',
        rank: 0,
        isSelf: true,
        breakdown: personal.breakdown,
      },
      standings: [],
      coachId: profile.coach_id as string,
      missions,
    }
  }

  if (me) {
    me = { ...me, breakdown: personal.breakdown }
  }

  return {
    optIn: true,
    seasonKey: recomputed.seasonKey,
    startsOn: recomputed.startsOn,
    endsOn: recomputed.endsOn,
    me: me ?? null,
    standings,
    coachId: profile.coach_id as string,
    missions,
  }
}
