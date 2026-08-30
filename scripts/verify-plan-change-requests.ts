import {
  PLAN_CHANGE_CLAIM_STALE_MS,
  canClaimPlanChangeGeneration,
  notesBelongToPlanChangeRequest,
  planChangeRequestMarker,
  stillOwnsPlanChangeClaim,
} from '../src/lib/plan-change-policy'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

const requestId = '11111111-2222-3333-4444-555555555555'
const marker = planChangeRequestMarker(requestId)
const notes = `@@META{"generatedBy":"ai","source":"client_plan_change"}@@\n${marker}\nScope: diet`

assert('marker is stable', marker === `Request id: ${requestId}`)
assert('notes match this request', notesBelongToPlanChangeRequest(notes, requestId))
assert('notes reject other request', !notesBelongToPlanChangeRequest(notes, 'other-id'))
assert('empty notes do not match', !notesBelongToPlanChangeRequest('', requestId))

assert(
  'unclaimed generating row can be claimed',
  canClaimPlanChangeGeneration({
    status: 'generating',
    generationStartedAt: null,
    draftPlanId: null,
  })
)
assert(
  'in-flight claim is not stolen',
  !canClaimPlanChangeGeneration({
    status: 'generating',
    generationStartedAt: new Date().toISOString(),
    draftPlanId: null,
  })
)
assert(
  'stale in-flight claim can be reclaimed',
  canClaimPlanChangeGeneration({
    status: 'generating',
    generationStartedAt: new Date(Date.now() - PLAN_CHANGE_CLAIM_STALE_MS - 1000).toISOString(),
    draftPlanId: null,
  })
)
assert(
  'draft already ready cannot be claimed again',
  !canClaimPlanChangeGeneration({
    status: 'generating',
    generationStartedAt: null,
    draftPlanId: 'draft-1',
    draftReadyAt: '2026-08-25T12:05:00.000Z',
  })
)
assert(
  'reserved draft in-flight cannot be stolen',
  !canClaimPlanChangeGeneration({
    status: 'generating',
    generationStartedAt: new Date().toISOString(),
    draftPlanId: 'draft-1',
    draftReadyAt: null,
  })
)
assert(
  'stale reserved draft can be reclaimed',
  canClaimPlanChangeGeneration({
    status: 'generating',
    generationStartedAt: new Date(Date.now() - PLAN_CHANGE_CLAIM_STALE_MS - 1000).toISOString(),
    draftPlanId: 'draft-1',
    draftReadyAt: null,
  })
)
assert(
  'ready request cannot be claimed',
  !canClaimPlanChangeGeneration({
    status: 'draft_ready',
    generationStartedAt: null,
    draftPlanId: null,
  })
)

const claimedAt = '2026-08-25T12:00:00.000Z'
assert(
  'owner keeps the claim',
  stillOwnsPlanChangeClaim({ status: 'generating', generation_started_at: claimedAt }, claimedAt)
)
assert(
  'owner keeps the claim across timestamp formats',
  stillOwnsPlanChangeClaim(
    { status: 'generating', generation_started_at: '2026-08-25T12:00:00+00:00' },
    claimedAt
  )
)
assert(
  'lost claim after steal',
  !stillOwnsPlanChangeClaim(
    { status: 'generating', generation_started_at: '2026-08-25T12:10:00.000Z' },
    claimedAt
  )
)
assert(
  'lost claim after ready',
  !stillOwnsPlanChangeClaim({ status: 'draft_ready', generation_started_at: claimedAt }, claimedAt)
)

if (failed > 0) {
  console.error(`${failed} assertion(s) failed`)
  process.exit(1)
}

console.log('plan-change claim policy ok')
