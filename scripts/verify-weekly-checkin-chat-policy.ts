/**
 * Weekly check-ins must never enter shared chat; mid-week still may.
 * Run: npx tsx scripts/verify-weekly-checkin-chat-policy.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatMidWeekCheckinChatMessage,
  formatWeeklyCheckinChatMessage,
  isWeeklyCheckinSystemMessage,
  isCheckinSystemMessage,
} from '../src/lib/checkin-chat'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

const weeklyMsg = formatWeeklyCheckinChatMessage({
  coachingWeek: 1,
  weight: 84,
  chest: 110,
  thigh: 45,
  navel: 99,
  dietAdherence: 8,
  workoutAdherence: 9,
  energyLevel: 8,
  sleepQuality: 10,
  stressLevel: 6,
  motivationLevel: 9,
  progressRating: 8,
  progressNotes: 'Feeling lighter',
  photoCount: 3,
  journeyUrl: '/journey',
})

assert.equal(isWeeklyCheckinSystemMessage(weeklyMsg), true)
pass('detects weekly check-in system message')

assert.equal(isCheckinSystemMessage(weeklyMsg), true)
pass('weekly still classified as check-in system message for legacy filtering')

const midMsg = formatMidWeekCheckinChatMessage({
  coachingWeek: 1,
  dietAdherence: 8,
  workoutAdherence: 8,
  energyLevel: 7,
  sleepQuality: 7,
  stressLevel: 4,
  adherenceWins: 'Hit protein',
  adherenceStruggles: 'Late nights',
})

assert.equal(isWeeklyCheckinSystemMessage(midMsg), false)
pass('mid-week is not treated as weekly')

const submitSrc = readFileSync(join(process.cwd(), 'src/app/api/checkin/submit/route.ts'), 'utf8')
assert.equal(submitSrc.includes('formatWeeklyCheckinChatMessage'), false)
pass('weekly submit route no longer formats weekly chat dumps')

assert.match(submitSrc, /checkinType === 'mid_week'[\s\S]*postCheckinToCoachChat/)
pass('mid-week submit still posts to chat')

assert.match(submitSrc, /generateWeeklyPlanDraft/)
pass('weekly submit still triggers AI draft generation')

const chatSrc = readFileSync(join(process.cwd(), 'src/lib/coach-chat.ts'), 'utf8')
assert.match(
  chatSrc,
  /if \(input\.checkinType === 'weekly'\) \{\s*return \{ error: null \}/
)
pass('postCheckinToCoachChat hard-blocks weekly check-in posts')

const draftSrc = readFileSync(join(process.cwd(), 'src/lib/ai/weekly-plan-draft.ts'), 'utf8')
assert.equal(draftSrc.includes('shouldSkipCorePlanRefresh'), false)
assert.match(draftSrc, /actionId: 'review_update_diet'/)
assert.match(draftSrc, /actionId: 'review_update_workout'/)
pass('weekly AI draft always regenerates diet + workout')

console.log('\nAll weekly check-in chat policy checks passed.')
