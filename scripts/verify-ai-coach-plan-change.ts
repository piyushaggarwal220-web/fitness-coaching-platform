import assert from 'node:assert/strict'
import {
  blocksPlanChangeLock,
  dropStaleYesPrompt,
  isPlanChangeCancel,
  isPlanChangeConfirm,
  replacesPendingPlanChange,
  stripPlanChangeTrailer,
  wantsPlanChangeAppliedNow,
  withConfirmCue,
} from '../src/lib/ai/ai-coach-plan-change-pure'

assert.equal(isPlanChangeConfirm('yes'), true)
assert.equal(isPlanChangeConfirm('YES lock it'), true)
assert.equal(isPlanChangeConfirm('haan'), true)
assert.equal(isPlanChangeConfirm('please rewrite my whole diet with 20 new meals'), false)
assert.equal(isPlanChangeCancel('no'), true)
assert.equal(isPlanChangeCancel('cancel'), true)
assert.equal(
  isPlanChangeCancel('No\nMje seated m nahi chahiye workout normal kar do mera sab ple jesa'),
  false
)
assert.equal(isPlanChangeConfirm('ok make a new split'), false)
assert.equal(replacesPendingPlanChange('Need a new split of workout'), true)
assert.equal(replacesPendingPlanChange('Need to talk'), false)
assert.equal(replacesPendingPlanChange('yes'), false)
assert.equal(blocksPlanChangeLock('Hard diet me exact kya chahiye?'), true)
assert.equal(blocksPlanChangeLock('Seated row remove. Reply YES to lock it.'), false)
assert.doesNotMatch(
  dropStaleYesPrompt('Need to talk', 'Write it here.\nReply YES to lock this into My Plan.'),
  /YES/
)
assert.equal(wantsPlanChangeAppliedNow('please update my plan and remove dairy'), true)
assert.equal(wantsPlanChangeAppliedNow('what should I eat today'), false)

const stripped = stripPlanChangeTrailer(
  'I can drop dairy from dinner.\n\n<<<PLAN_CHANGE\n{"action":"propose","scope":"diet","requestText":"Remove dairy from dinner and use soya curd instead."}\n>>>'
)
assert.equal(stripped.visible.includes('<<<PLAN_CHANGE'), false)
assert.equal(stripped.propose?.scope, 'diet')
assert.match(stripped.propose?.requestText ?? '', /soya curd/)

assert.match(withConfirmCue('Summary here.', 2), /Reply YES/)
assert.match(withConfirmCue('Reply YES already.', 2), /^Reply YES already\.$/)

console.log('verify-ai-coach-plan-change: ok')
