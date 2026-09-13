import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  coachAcceptsAutoAssignment,
  coachRequiresManualPlanDelivery,
  coachUsesFifoWorkQueue,
  shouldScheduleCheckinAutoReply,
} from '../src/lib/coach-delivery-policy'
import { isTrialClientHiddenFromCoaches } from '../src/lib/coach-roster-visibility'

const PIYUSH_COACH_ID = 'fde68466-fb3e-4a24-a5f2-97a60a363690'
const RAKSHIT_COACH_ID = 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'trial-abc@trial.test.local',
    access_source: 'admin_trial',
  }),
  true
)
assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'paying@example.com',
    access_source: 'purchase',
  }),
  false
)
assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'client@test.local',
    access_source: 'admin_trial',
  }),
  false
)
assert.equal(
  isTrialClientHiddenFromCoaches({
    email: 'hidden-trial@example.com',
    access_source: 'admin_trial',
  }),
  true
)

assert.equal(coachAcceptsAutoAssignment(PIYUSH_COACH_ID), false)
assert.equal(coachAcceptsAutoAssignment(RAKSHIT_COACH_ID), true)
assert.equal(coachAcceptsAutoAssignment(null), false)
assert.equal(coachRequiresManualPlanDelivery(PIYUSH_COACH_ID), true)
assert.equal(coachRequiresManualPlanDelivery(RAKSHIT_COACH_ID), true)
assert.equal(shouldScheduleCheckinAutoReply('mid_week', PIYUSH_COACH_ID), true)
assert.equal(shouldScheduleCheckinAutoReply('mid_week', RAKSHIT_COACH_ID), true)
assert.equal(shouldScheduleCheckinAutoReply('weekly', PIYUSH_COACH_ID), false)
assert.equal(shouldScheduleCheckinAutoReply('weekly', RAKSHIT_COACH_ID), false)
assert.equal(coachUsesFifoWorkQueue(PIYUSH_COACH_ID), true)
assert.equal(coachUsesFifoWorkQueue(RAKSHIT_COACH_ID), false)

const resolveSrc = fs.readFileSync(path.join(root, 'src/lib/coach-work-queue-resolve.ts'), 'utf8')
assert.match(resolveSrc, /coachRequiresManualPlanDelivery/)
assert.match(resolveSrc, /MANUAL_DELIVER_FROM_PLAN_PAGE/)

const publishSrc = fs.readFileSync(path.join(root, 'src/app/api/coach/ai-draft/publish/route.ts'), 'utf8')
assert.match(publishSrc, /skipReplyWait:\s*true/)

const planDetailSrc = fs.readFileSync(path.join(root, 'src/app/coach/plan/[id]/page.tsx'), 'utf8')
assert.match(planDetailSrc, /publishPlanViaApi/)
assert.match(planDetailSrc, /const published = await publishPlanViaApi/)
assert.doesNotMatch(planDetailSrc, /await activatePlan\(/)

const missedCronSrc = fs.readFileSync(
  path.join(root, 'src/app/api/cron/send-missed-weekly-plans/route.ts'),
  'utf8'
)
assert.match(missedCronSrc, /manual_plan_delivery/)
assert.match(missedCronSrc, /coachRequiresManualPlanDelivery/)

console.log(
  '✓ trial clients stay hidden; weekly plans are manual; mid-week auto-replies for both coaches; Complete does not auto-publish for manual coaches'
)
