import {
  clientCoachNotes,
  encodePlanMeta,
  formatPublishedPlanTitle,
  isAiDraftTitle,
  parsePlanMeta,
  planMatchesCheckin,
  prepareCoachNotesForPublish,
  prepareCoachNotesForSave,
  stripPlanMeta,
} from '../src/lib/plan-metadata'
import { sanitizeDraftFailureError } from '../src/lib/ai/draft-error'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

const meta =
  '@@META{"checkinId":"abc-123","week":3,"generatedBy":"ai","source":"Week 3 Check-in"}@@\nGreat week — keep protein high.'

assert('stripPlanMeta removes prefix', !clientCoachNotes(meta).includes('@@META'))
assert('clientCoachNotes preserves message', clientCoachNotes(meta).includes('Great week'))
assert('parsePlanMeta reads checkinId', parsePlanMeta({ title: 'AI Draft · Week 3', coach_notes: meta, phase: null }).checkinId === 'abc-123')
assert(
  'planMatchesCheckin matches by meta',
  planMatchesCheckin({ title: 'AI Draft · Week 3', coach_notes: meta, phase: null }, 'abc-123')
)
assert(
  'planMatchesCheckin rejects wrong id',
  !planMatchesCheckin({ title: 'AI Draft · Week 3', coach_notes: meta, phase: null }, 'other')
)

const saved = prepareCoachNotesForSave('Updated client message', {
  title: 'AI Draft · Week 3',
  coach_notes: meta,
  phase: null,
})
assert('prepareCoachNotesForSave re-encodes meta', saved?.includes('@@META') && saved?.includes('Updated client message'))

const manualSave = prepareCoachNotesForSave('Manual note', {
  title: 'Week 2 Plan',
  coach_notes: 'Manual note',
  phase: null,
})
assert('prepareCoachNotesForSave skips meta for non-draft', manualSave === 'Manual note')

const publish = prepareCoachNotesForPublish(meta)
assert('prepareCoachNotesForPublish strips meta', publish.notes?.includes('Great week') && !publish.notes?.includes('@@META'))

const emptyPublish = prepareCoachNotesForPublish('@@META{"checkinId":"x","week":1,"generatedBy":"ai"}@@')
assert('prepareCoachNotesForPublish blocks empty notes', emptyPublish.error !== null)

assert(
  'formatPublishedPlanTitle for first delivery',
  formatPublishedPlanTitle(
    {
      title: 'AI Draft · Week 5',
      coach_notes:
        '@@META{"checkinId":"abc-123","week":5,"generatedBy":"ai","source":"Week 5 Check-in"}@@\nGreat week.',
      phase: null,
    },
    false
  ) === 'Week 5 Plan'
)
assert(
  'formatPublishedPlanTitle for update',
  formatPublishedPlanTitle(
    {
      title: 'AI Draft · Week 5',
      coach_notes:
        '@@META{"checkinId":"abc-123","week":5,"generatedBy":"ai","source":"Week 5 Check-in"}@@\nGreat week.',
      phase: null,
    },
    true
  ) === 'Week 5 Updated Plan'
)
assert('isAiDraftTitle detects draft', isAiDraftTitle('AI Draft · Week 1'))

assert(
  'sanitizeDraftFailureError hides stack traces',
  sanitizeDraftFailureError('Error at src/lib/ai/generate-plan.ts:120:5') === 'Plan generation failed. Retry available.'
)
assert(
  'sanitizeDraftFailureError maps timeout',
  sanitizeDraftFailureError('Request timed out after 120s') === 'Generation timed out. Retry available.'
)

const roundTrip = encodePlanMeta(
  { checkinId: 'abc-123', week: 3, generatedBy: 'ai' },
  'Client message'
)
assert('encode + strip round trip', clientCoachNotes(roundTrip) === 'Client message')

if (failed > 0) {
  console.error(`\n${failed} plan metadata checks failed`)
  process.exit(1)
}

console.log('\nAll plan metadata checks passed')
