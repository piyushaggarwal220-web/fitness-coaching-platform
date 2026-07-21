import assert from 'node:assert/strict'
import {
  digestBucket,
  getCostPolicy,
  selectChannels,
  whatsappWithinCaps,
} from '../src/lib/notifications/cost-policy'

const coachReply = getCostPolicy('coach_replied')
assert.deepEqual(coachReply.immediate, ['in_app', 'web_push'])
assert.deepEqual(coachReply.escalation, [], 'individual coach replies must never use WhatsApp')

const unreadChat = getCostPolicy('unread_chat')
assert.equal(unreadChat.escalationDelayMinutes, 720)
assert.deepEqual(selectChannels('unread_chat', false), ['in_app', 'web_push'])
assert.deepEqual(selectChannels('unread_chat', true), ['in_app', 'web_push', 'whatsapp'])

assert.equal(whatsappWithinCaps({
  userToday: 0, userWeek: 0, globalMonth: 0,
  dailyCap: 1, weeklyCap: 3, monthlyCap: 1000, circuitEnabled: true,
}), true)
assert.equal(whatsappWithinCaps({
  userToday: 1, userWeek: 1, globalMonth: 1,
  dailyCap: 1, weeklyCap: 3, monthlyCap: 1000, circuitEnabled: true,
}), false)
assert.equal(whatsappWithinCaps({
  userToday: 0, userWeek: 0, globalMonth: 1000,
  dailyCap: 1, weeklyCap: 3, monthlyCap: 1000, circuitEnabled: true,
}), false)
assert.equal(whatsappWithinCaps({
  userToday: 0, userWeek: 0, globalMonth: 0,
  dailyCap: 1, weeklyCap: 3, monthlyCap: 1000, circuitEnabled: false,
}), false)

const first = digestBucket('user-1', 'unread_chat', 30, Date.UTC(2026, 0, 1, 10, 1))
const same = digestBucket('user-1', 'unread_chat', 30, Date.UTC(2026, 0, 1, 10, 29))
const next = digestBucket('user-1', 'unread_chat', 30, Date.UTC(2026, 0, 1, 10, 31))
assert.equal(first, same)
assert.notEqual(first, next)

console.log('Notification delivery policy verification passed.')
