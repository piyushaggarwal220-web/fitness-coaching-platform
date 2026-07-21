import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  digestBucket,
  getCostPolicy,
  selectChannels,
  whatsappWithinCaps,
} from '../src/lib/notifications/cost-policy'
import {
  DAILY_RECONCILIATION_LIMIT,
  isHobbyCompatibleDailyCron,
  notificationDrainPlan,
} from '../src/lib/notifications/drain-policy'
import { resolveWebPushStatus } from '../src/lib/notifications/web-push-client'

assert.equal(resolveWebPushStatus(false, 'default', false), 'unsupported')
assert.equal(resolveWebPushStatus(true, 'denied', false), 'blocked')
assert.equal(resolveWebPushStatus(true, 'default', false), 'not-enabled')
assert.equal(resolveWebPushStatus(true, 'granted', false), 'not-enabled')
assert.equal(resolveWebPushStatus(true, 'granted', true), 'enabled')

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

const immediate = notificationDrainPlan('immediate', 'event-123')
assert.deepEqual(immediate, {
  mode: 'immediate',
  limit: 4,
  eventId: 'event-123',
  requiresLease: false,
})
const opportunistic = notificationDrainPlan('opportunistic')
assert.equal(opportunistic.limit, 5)
assert.equal(opportunistic.requiresLease, true)
assert.equal(opportunistic.leaseSeconds, 30)
assert.equal(DAILY_RECONCILIATION_LIMIT, 100)

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  crons: Array<{ path: string; schedule: string }>
}
const deliveryCron = vercel.crons.find((cron) => cron.path === '/api/cron/notification-delivery')
assert.ok(deliveryCron, 'daily notification reconciliation cron must exist')
assert.equal(isHobbyCompatibleDailyCron(deliveryCron.schedule), true)
assert.notEqual(deliveryCron.schedule, '* * * * *')

const dispatcherSource = readFileSync(
  new URL('../src/lib/notifications/dispatcher.ts', import.meta.url),
  'utf8'
)
assert.match(dispatcherSource, /scheduleImmediateNotificationDrain\(eventId\)/)
const authSource = readFileSync(new URL('../src/lib/api-auth.ts', import.meta.url), 'utf8')
assert.match(authSource, /scheduleOpportunisticNotificationDrain\(\)/)
const adminAuthSource = readFileSync(new URL('../src/lib/admin/api-auth.ts', import.meta.url), 'utf8')
assert.match(adminAuthSource, /scheduleOpportunisticNotificationDrain\(\)/)
const notificationRouteSource = readFileSync(
  new URL('../src/app/api/notifications/route.ts', import.meta.url),
  'utf8'
)
assert.match(notificationRouteSource, /scheduleOpportunisticNotificationDrain\(\)/)

console.log('Notification delivery policy verification passed.')
