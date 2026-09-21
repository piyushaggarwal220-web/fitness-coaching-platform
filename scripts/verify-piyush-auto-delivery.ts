import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PIYUSH_COACH_ID,
  RAKSHIT_COACH_ID,
  coachRequiresManualPlanDelivery,
  shouldAutoProcessCoachWorkQueue,
  shouldAutoProcessPiyushWorkQueue,
  shouldScheduleCheckinAutoReply,
} from '../src/lib/coach-delivery-policy'

assert.equal(coachRequiresManualPlanDelivery(PIYUSH_COACH_ID), false)
assert.equal(coachRequiresManualPlanDelivery(RAKSHIT_COACH_ID), false)
assert.equal(shouldScheduleCheckinAutoReply('weekly', PIYUSH_COACH_ID), true)
assert.equal(shouldScheduleCheckinAutoReply('weekly', RAKSHIT_COACH_ID), true)
assert.equal(shouldAutoProcessCoachWorkQueue(PIYUSH_COACH_ID), true)
assert.equal(shouldAutoProcessCoachWorkQueue(RAKSHIT_COACH_ID), true)
assert.equal(shouldAutoProcessPiyushWorkQueue(RAKSHIT_COACH_ID), true)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const chatSrc = fs.readFileSync(path.join(root, 'src/lib/piyush-chat-auto.ts'), 'utf8')
assert.match(chatSrc, /chatNeedsHumanCoach/)
assert.match(chatSrc, /refund/)
assert.match(chatSrc, /type === 'voice'/)
assert.match(chatSrc, /rakshit/)
assert.match(chatSrc, /coachFirstName/)

const queueSrc = fs.readFileSync(path.join(root, 'src/lib/piyush-work-queue-auto.ts'), 'utf8')
assert.match(queueSrc, /call_request/)
assert.match(queueSrc, /Phone call/)
assert.match(queueSrc, /processCoachWorkQueue/)
assert.match(queueSrc, /processAutoCoachWorkQueues/)

const cronSrc = fs.readFileSync(path.join(root, 'src/app/api/cron/piyush-initial-plans/route.ts'), 'utf8')
assert.match(cronSrc, /processAutoCoachWorkQueues/)

console.log('✓ Piyush and Rakshit weekly auto-delivery on; calls stay human')
