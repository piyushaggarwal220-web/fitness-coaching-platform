import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatMidWeekCheckinChatMessage } from '../src/lib/checkin-chat'
import { getClientCheckinSchedule } from '../src/lib/checkin-schedule'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

const message = formatMidWeekCheckinChatMessage({
  coachingWeek: 2,
  dietAdherence: 8,
  workoutAdherence: 7,
  energyLevel: 6,
  sleepQuality: 8,
  stressLevel: 4,
  hungerLevel: 5,
  adherenceWins: 'Completed every planned meal.',
  adherenceStruggles: 'Missed one workout.',
  painInjuries: 'None',
  questionsForCoach: 'Should I move training to mornings?',
  additionalComments: 'Travel starts Friday.',
})

assert.match(message, /Hunger: 5\/10/)
assert.match(message, /Travel starts Friday\./)
assert.match(message, /Coach reply requested/)
assert.match(message, /No plan update is needed\./)

const anchor = '2026-01-01T18:30:00.000Z'
const dueSchedule = getClientCheckinSchedule(
  anchor,
  [],
  new Date('2026-01-03T18:30:00.000Z')
)
assert.equal(
  dueSchedule.todayTasks.some((task) => task.type === 'mid_week' && task.status === 'available'),
  true
)

const submitRoute = source('src/app/api/checkin/submit/route.ts')
assert.match(submitRoute, /if \(body\.checkinType === 'weekly'\) \{\s*\/\/ Mark in-flight/)
assert.match(submitRoute, /const chatPost = await postCheckinToCoachChat\(/)
assert.match(submitRoute, /hungerLevel: body\.hunger_level/)
assert.match(submitRoute, /additionalComments: body\.additional_comments/)
assert.match(submitRoute, /idempotencyKey: `checkin-submitted:\$\{inserted\.id\}:coach`/)
assert.match(
  submitRoute,
  /`\/coach\/chat\?clientId=\$\{user\.id\}&checkinId=\$\{inserted\.id\}`/
)

const draftSource = source('src/lib/ai/weekly-plan-draft.ts')
assert.match(draftSource, /if \(checkin\.checkin_type !== 'weekly'\)/)
assert.match(
  draftSource,
  /Mid-week check-ins require a coach reply in chat and never create a plan draft/
)

const retryRoute = source('src/app/api/coach/ai-draft/retry/route.ts')
assert.match(retryRoute, /if \(checkin\.checkin_type !== 'weekly'\)/)
assert.match(retryRoute, /Mid-week check-ins only require a reply in coach chat/)

const chatSource = source('src/lib/coach-chat.ts')
assert.match(chatSource, /sourceCheckinId: input\.checkinId/)
assert.match(chatSource, /incrementCoachUnread: true/)
assert.match(chatSource, /completeMidWeekCheckinFromCoachReply/)
assert.match(chatSource, /Coach replied with a voice message in chat/)
assert.match(chatSource, /idempotencyKey: `checkin-chat:\$\{input\.checkinId\}:coach`/)
assert.match(chatSource, /checkin_type !== 'mid_week'/)
assert.match(chatSource, /ensureCheckinInCoachChat/)
assert.match(chatSource, /formatCheckinChatMessageFromRow/)

const openChat = source('src/lib/coach-open-chat.ts')
assert.match(openChat, /checkinId/)
assert.match(openChat, /JSON\.stringify\(\{ clientId, checkinId \}\)/)

const coachConversations = source('src/app/api/chat/coach-conversations/route.ts')
assert.match(coachConversations, /ensureCheckinInCoachChat/)
assert.match(coachConversations, /checkinId/)

const migration = source('supabase/migrations/20260726152459_link_checkins_to_coach_chat.sql')
assert.match(migration, /ADD COLUMN IF NOT EXISTS source_checkin_id uuid/)
assert.match(migration, /UNIQUE INDEX IF NOT EXISTS conversation_messages_source_checkin_uidx/)

const coachCheckinPage = source('src/app/coach/checkin/[id]/page.tsx')
assert.match(coachCheckinPage, /A mid-week check-in does not create a new plan/)
assert.match(coachCheckinPage, /Open chat and reply/)
assert.match(coachCheckinPage, /text or voice/)

const workQueue = source('src/lib/coach-work-queue.ts')
assert.match(workQueue, /Reply to Mid-Week Check-in/)
assert.match(
  workQueue,
  /`\/coach\/chat\?clientId=\$\{checkin\.client_id\}&checkinId=\$\{checkin\.id\}`/
)

const workQueueResolve = source('src/lib/coach-work-queue-resolve.ts')
assert.match(workQueueResolve, /Reply to this mid-week check-in in coach chat to complete it/)

const agents = source('AGENTS.md')
assert.match(agents, /Check-in invariants/)
assert.match(agents, /summary belongs in coach chat/)

const reminderCron = source('src/app/api/cron/checkin-reminders/route.ts')
assert.match(reminderCron, /status === 'available'/)
assert.match(reminderCron, /checkin-due:\$\{client\.id\}:\$\{task\.type\}:\$\{task\.coachingWeek\}/)

const vercel = JSON.parse(source('vercel.json')) as {
  crons: Array<{ path: string; schedule: string }>
}
assert.equal(
  vercel.crons.some((cron) => cron.path === '/api/cron/checkin-reminders'),
  true
)

console.log('Mid-week chat and check-in reminder verification passed.')
