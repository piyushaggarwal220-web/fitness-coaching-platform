/** A live league room does not open until this many members opt in. */
export const LEAGUE_ROOM_MIN_OPT_INS = 50

export type LeagueRoomStatus = {
  roomOpen: boolean
  optInCount: number
  optInTarget: number
  remaining: number
}

export function leagueRoomStatus(optInCount: number): LeagueRoomStatus {
  const count = Math.max(0, Math.floor(optInCount))
  const remaining = Math.max(0, LEAGUE_ROOM_MIN_OPT_INS - count)
  return {
    roomOpen: count >= LEAGUE_ROOM_MIN_OPT_INS,
    optInCount: count,
    optInTarget: LEAGUE_ROOM_MIN_OPT_INS,
    remaining,
  }
}
