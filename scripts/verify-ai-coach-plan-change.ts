import assert from 'node:assert/strict'
import {
  isPlanChangeCancel,
  isPlanChangeConfirm,
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
