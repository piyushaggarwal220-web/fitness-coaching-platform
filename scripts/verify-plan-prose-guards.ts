/**
 * Verifies week-handoff language is stripped from client-facing plan prose.
 * Run: npx tsx scripts/verify-plan-prose-guards.ts
 */
import assert from 'node:assert/strict'
import { normalizeAiPlanProse } from '../src/lib/ai/plan-format'
import { stripClientWeekHandoffLanguage } from '../src/lib/ai/plan-prose-guards'
import { fallbackPublishCoachNotes, formatPublishedPlanTitle } from '../src/lib/plan-metadata'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

{
  const raw = [
    'Welcome to week 2, Rohan!',
    'I swapped paneer for dal as you asked.',
    '',
    'Day 1',
    'Breakfast: oats',
  ].join('\n')
  const cleaned = stripClientWeekHandoffLanguage(raw)
  assert.ok(!/welcome to week/i.test(cleaned))
  assert.ok(cleaned.includes('swapped paneer'))
  assert.ok(cleaned.includes('Day 1'))
  pass('strips Welcome to week 2 but keeps the edit content')
}

{
  const cleaned = stripClientWeekHandoffLanguage(
    'Entering week 3 of your plan.\nHere is your updated diet.\nDay 1\nLunch: rice'
  )
  assert.ok(!/entering week/i.test(cleaned))
  assert.ok(cleaned.includes('Lunch: rice'))
  pass('strips Entering week N openers')
}

{
  const cleaned = normalizeAiPlanProse('Welcome to week 2!\n\nDay 1\nBreakfast: eggs')
  assert.ok(!/welcome to week/i.test(cleaned))
  assert.ok(cleaned.includes('Breakfast: eggs'))
  pass('normalizeAiPlanProse also strips week handoffs')
}

{
  const notes = fallbackPublishCoachNotes({
    title: 'AI Draft · Client request',
    coach_notes: '@@META:{"source":"client_plan_change"}@@',
    phase: null,
  })
  assert.ok(!/Week \d/i.test(notes))
  assert.match(notes, /updated plan is ready/i)
  pass('client-request publish fallback does not say Week N')
}

{
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
}

console.log('\nAll plan prose guard checks passed.')
