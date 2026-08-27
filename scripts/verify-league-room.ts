import assert from 'node:assert/strict'
import { leagueRoomStatus, LEAGUE_ROOM_MIN_OPT_INS } from '../src/lib/league/room'
import { buildLeagueCertificateChatGptPrompt } from '../src/lib/league/certificate-prompt'

assert.equal(LEAGUE_ROOM_MIN_OPT_INS, 50)
assert.deepEqual(leagueRoomStatus(0), {
  roomOpen: false,
  optInCount: 0,
  optInTarget: 50,
  remaining: 50,
})
assert.equal(leagueRoomStatus(49).roomOpen, false)
assert.equal(leagueRoomStatus(49).remaining, 1)
assert.equal(leagueRoomStatus(50).roomOpen, true)
assert.equal(leagueRoomStatus(50).remaining, 0)
assert.equal(leagueRoomStatus(80).roomOpen, true)

const prompt = buildLeagueCertificateChatGptPrompt({
  displayName: 'Alex M.',
  tier: 'gold',
  rank: 2,
  points: 240,
  monthLabel: 'August 2026',
})
assert.match(prompt, /Alex M\./)
assert.match(prompt, /Gold/)
assert.match(prompt, /August 2026/)
assert.match(prompt, /LURVOX/)
assert.match(prompt, /#FF6200/)
assert.match(prompt, /top 10%/)

console.log('League room + certificate prompt checks passed.')
