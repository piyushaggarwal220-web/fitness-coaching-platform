/**
 * Verifies week-handoff language is stripped from client-facing plan prose.
 * Run: npx tsx scripts/verify-plan-prose-guards.ts
 */
import assert from 'node:assert/strict'
import { normalizeAiPlanProse } from '../src/lib/ai/plan-format'
import {
  CLIENT_PLAN_EDIT_WEEK_RULES,
  stripClientWeekHandoffLanguage,
} from '../src/lib/ai/plan-prose-guards'
import { fallbackPublishCoachNotes, formatPublishedPlanTitle } from '../src/lib/plan-metadata'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

const raw = [
  'Welcome to week 2, Rohan!',
  'I swapped paneer for dal as you asked.',
  '',
  'Day 1',
  'Breakfast: oats',
].join('\n')
const cleanedWelcome = stripClientWeekHandoffLanguage(raw)
assert.ok(!/welcome to week/i.test(cleanedWelcome))
assert.ok(cleanedWelcome.includes('swapped paneer'))
assert.ok(cleanedWelcome.includes('Day 1'))
pass('strips Welcome to week 2 but keeps the edit content')

const cleanedEnter = stripClientWeekHandoffLanguage(
  'Entering week 3 of your plan.\nHere is your updated diet.\nDay 1\nLunch: rice'
)
assert.ok(!/entering week/i.test(cleanedEnter))
assert.ok(cleanedEnter.includes('Lunch: rice'))
pass('strips Entering week N openers')

const cleanedNorm = normalizeAiPlanProse('Welcome to week 2!\n\nDay 1\nBreakfast: eggs')
assert.ok(!/welcome to week/i.test(cleanedNorm))
assert.ok(cleanedNorm.includes('Breakfast: eggs'))
pass('normalizeAiPlanProse also strips week handoffs')

const notes = fallbackPublishCoachNotes({
  title: 'AI Draft · Client request',
  coach_notes: '@@META:{"source":"client_plan_change"}@@',
  phase: null,
})
assert.ok(!/Week \d/i.test(notes))
assert.match(notes, /updated plan is ready/i)
pass('client-request publish fallback does not say Week N')

const title = formatPublishedPlanTitle(
  {
    title: 'AI Draft · Client request',
    coach_notes: '@@META:{"source":"client_plan_change"}@@',
    phase: null,
  },
  true
)
assert.equal(title, 'Updated Plan')
pass('client-request published title is Updated Plan, not Week N')

const cleanedNext = stripClientWeekHandoffLanguage(
  [
    'Now that week 1 is done, here is what we will do next.',
    'This coming week we will raise carbs around training.',
    'I swapped paneer for tofu as you asked.',
    'Day 1',
    'Breakfast: oats',
  ].join('\n')
)
assert.ok(!/week 1 is done/i.test(cleanedNext))
assert.ok(!/this coming week we will/i.test(cleanedNext))
assert.ok(cleanedNext.includes('swapped paneer'))
pass('strips next-week progression narrative from small edits')

assert.match(CLIENT_PLAN_EDIT_WEEK_RULES, /in-place CLIENT EDIT/i)
assert.match(CLIENT_PLAN_EDIT_WEEK_RULES, /next week/i)
assert.match(CLIENT_PLAN_EDIT_WEEK_RULES, /ONLY the requested changes/i)
pass('client edit rules forbid next-week redesigns')

console.log('\nAll plan prose guard checks passed.')
