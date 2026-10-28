/**
 * The plan-status lies that already shipped to clients must not compile back in.
 * Run: npx tsx scripts/verify-client-plan-presence.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  absentPlanCopy,
  clientSafePlanError,
  copySaysPlanIsBeingCreated,
  intakePlanStartError,
  isStalePlanChangeRequest,
  livePlanSectionDetail,
  STALE_PLAN_CHANGE_DRAFT_MS,
  STALE_PLAN_CHANGE_GENERATING_MS,
} from '../src/lib/client-plan-presence'
import { validatePersistedOnboardingAnswers } from '../src/lib/initial-plan-generation-policy'
import { syncStoredDietText } from '../src/lib/ai/nutrition-macro-sync'

const windowLabel = '1–2 hours'

const delivered = absentPlanCopy({ planDelivered: true, windowLabel, instant: true })
const ready = absentPlanCopy({ jobStatus: 'ready', windowLabel, instant: true })
const failed = absentPlanCopy({ jobStatus: 'failed', windowLabel })
const building = absentPlanCopy({ jobStatus: 'generating', windowLabel, instant: true })

assert.equal(copySaysPlanIsBeingCreated('It is not still being created.'), false)
assert.equal(copySaysPlanIsBeingCreated('Your plan is still being created.'), true)

for (const copy of [delivered, ready, failed]) {
  assert.equal(copy.inProgress, false)
  assert.equal(copySaysPlanIsBeingCreated(`${copy.headline} ${copy.detail}`), false)
}

assert.equal(building.inProgress, true)
assert.match(building.headline, /not in My Plan yet/)
assert.match(building.detail, /1–2 hours/)
assert.doesNotMatch(`${building.headline} ${building.detail}`, /smart coach|soon|building/i)

assert.equal(
  copySaysPlanIsBeingCreated(livePlanSectionDetail({ hasDiet: true, hasWorkout: true })),
  false
)
assert.match(livePlanSectionDetail({ hasDiet: true, hasWorkout: false }), /workout section is empty/)
assert.doesNotMatch(
  livePlanSectionDetail({ hasDiet: false, hasWorkout: true }),
  /Diet and workout are in My Plan/
)

const now = Date.parse('2026-10-13T12:00:00.000Z')
assert.equal(
  isStalePlanChangeRequest('generating', now - STALE_PLAN_CHANGE_GENERATING_MS - 1, now),
  true
)
assert.equal(
  isStalePlanChangeRequest('generating', now - 60 * 60 * 1000, now),
  false
)
assert.equal(
  isStalePlanChangeRequest('draft_ready', now - STALE_PLAN_CHANGE_DRAFT_MS - 1, now),
  true
)
assert.equal(isStalePlanChangeRequest('in_review', now - 60 * 60 * 1000, now), false)

assert.equal(
  intakePlanStartError('A coach must be assigned before generation.'),
  'Intake saved, but your plan could not be started yet. Please try again or message support.'
)
assert.equal(
  intakePlanStartError(''),
  'Intake saved, but your plan could not be started yet. Please try again or message support.'
)
assert.match(
  intakePlanStartError('Add your chest measurement.'),
  /chest measurement/
)
assert.doesNotMatch(intakePlanStartError('Could not queue generation'), /generat/i)
assert.equal(
  clientSafePlanError('Request failed: Generation failed', 'Request failed. Try again tomorrow.'),
  'Request failed. Try again tomorrow.'
)
assert.equal(clientSafePlanError('Add your chest measurement.', 'fallback'), 'Add your chest measurement.')
assert.equal(
  validatePersistedOnboardingAnswers({ coach_id: null } as never),
  'A coach must be assigned before the plan can start.'
)
assert.doesNotMatch(
  validatePersistedOnboardingAnswers({ coach_id: null } as never) ?? '',
  /generat/i
)

const replySource = readFileSync(new URL('../src/lib/checkin-auto-reply.ts', import.meta.url), 'utf8')
const claimStart = replySource.indexOf('Lock on the')
const claimEnd = replySource.indexOf("reason: 'claimed_elsewhere'")
assert.ok(claimStart > 0 && claimEnd > claimStart)
const claim = replySource.slice(claimStart, claimEnd)
assert.match(claim, /\.is\('auto_replied_at', null\)/)
assert.match(claim, /\.is\('coach_response', null\)/)
assert.doesNotMatch(claim, /\.eq\('reviewed', false\)/)
assert.match(replySource, /notifyPlansPublishedWithoutReply/)

const collapsed = syncStoredDietText(
  [
    'Calories: 1842',
    'Protein: 147g',
    'Carbs: 220g',
    'Fat: 55g',
    '',
    'Daily total: P: 12g | C: 20g | F: 3g | ~150 kcal',
    'Daily total: P: 12g | C: 20g | F: 3g | ~150 kcal',
  ].join('\n')
)
assert.match(collapsed, /Calories:\s*1842/)
assert.doesNotMatch(collapsed, /Calories:\s*150\b/)
assert.doesNotMatch(collapsed, /Protein:\s*0g/i)

console.log('✓ a delivered or finished plan cannot be described as still being created')
