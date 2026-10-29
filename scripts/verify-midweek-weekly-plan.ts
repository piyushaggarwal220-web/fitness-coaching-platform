import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pickSameWeekMidWeekCheckin, combineCheckinFreeText } from '../src/lib/ai/same-week-midweek'
import { buildClientJourneySnapshot } from '../src/lib/ai/client-journey'
import { checkinNeedsCoachResponse } from '../src/lib/checkin-pending-auto-reply'
import { shouldScheduleCheckinAutoReply } from '../src/lib/coach-delivery-policy'
import { PIYUSH_COACH_ID } from '../src/lib/coach-delivery-policy'
import type { Checkin } from '../src/types/database'

function checkin(partial: Partial<Checkin> & Pick<Checkin, 'id' | 'checkin_type'>): Checkin {
  return {
    client_id: 'client-1',
    coach_id: 'coach-1',
    submitted_at: '2026-10-26T10:00:00.000Z',
    coaching_week: 4,
    coaching_day: 3,
    due_date: null,
    due_at: null,
    weight: null,
    waist: null,
    chest: null,
    thigh: null,
    navel: null,
    progress_photo_front: null,
    progress_photo_side: null,
    progress_photo_back: null,
    energy_level: 7,
    hunger_level: null,
    training_performance: null,
    adherence_score: 7,
    diet_adherence: 7,
    workout_adherence: 8,
    days_followed_diet: 3,
    days_followed_workout: 3,
    days_followed_sleep: 2,
    days_followed_water: 3,
    days_followed_steps: 3,
    sleep_quality: 6,
    stress_level: 4,
    motivation_level: null,
    digestion: null,
    pain_injuries: null,
    questions_for_coach: null,
    cardio_completed: null,
    progress_rating: null,
    progress_notes: null,
    adherence_wins: null,
    adherence_struggles: null,
    extra_photos: null,
    plan_version: null,
    notes: null,
    coach_response: null,
    reviewed: false,
    reviewed_at: null,
    auto_reply_at: null,
    auto_replied_at: null,
    workout_split_preference: null,
    workout_difficulty: null,
    ...partial,
  }
}

assert.equal(shouldScheduleCheckinAutoReply('mid_week', PIYUSH_COACH_ID), false)
assert.equal(shouldScheduleCheckinAutoReply('mid_week', 'any-coach'), false)

const weekly = checkin({
  id: 'weekly-4',
  checkin_type: 'weekly',
  submitted_at: '2026-10-29T10:00:00.000Z',
  coaching_day: 7,
})
const midWeek = checkin({
  id: 'mid-4',
  checkin_type: 'mid_week',
  submitted_at: '2026-10-26T10:00:00.000Z',
  adherence_struggles: 'Late dinners',
  questions_for_coach: 'Can we drop rice at night?',
})
const otherWeek = checkin({
  id: 'mid-3',
  checkin_type: 'mid_week',
  coaching_week: 3,
  questions_for_coach: 'Old question',
})

assert.equal(pickSameWeekMidWeekCheckin(weekly, [otherWeek, midWeek, weekly])?.id, 'mid-4')
assert.equal(pickSameWeekMidWeekCheckin(midWeek, [midWeek, weekly]), null)

const combined = combineCheckinFreeText(weekly, midWeek)
assert.match(combined, /Late dinners/)
assert.match(combined, /drop rice/)

const snapshot = buildClientJourneySnapshot({
  profile: { checkin_schedule_started_at: '2026-10-01T00:00:00.000Z' },
  checkins: [midWeek, weekly],
  currentCheckin: weekly,
})
assert.match(snapshot, /Same-week mid-week check-in/)
assert.match(snapshot, /drop rice/)
assert.match(snapshot, /Late dinners/)

const root = process.cwd()
const autoReplySrc = readFileSync(join(root, 'src/lib/checkin-auto-reply.ts'), 'utf8')
assert.match(autoReplySrc, /midweek_in_weekly/)
assert.match(autoReplySrc, /checkin_type === 'mid_week'/)

const draftSrc = readFileSync(join(root, 'src/lib/ai/weekly-plan-draft.ts'), 'utf8')
assert.match(draftSrc, /loadSameWeekMidWeekCheckin/)
assert.match(draftSrc, /sameWeekMidWeekCheckin: sameWeekMidWeek/)

const submitSrc = readFileSync(join(root, 'src/app/api/checkin/submit/route.ts'), 'utf8')
assert.equal(submitSrc.includes('generateMidWeekAnalysis'), false)
assert.match(submitSrc, /checkinType === 'weekly'[\s\S]*checkin_awaiting: true/)

assert.equal(
  checkinNeedsCoachResponse({ checkin_type: 'mid_week', reviewed: false, auto_reply_at: null }),
  false
)
assert.equal(
  checkinNeedsCoachResponse({ checkin_type: 'weekly', reviewed: false, auto_reply_at: null }),
  true
)
assert.equal(
  checkinNeedsCoachResponse({
    checkin_type: 'weekly',
    reviewed: false,
    auto_reply_at: '2026-10-29T10:00:00.000Z',
    auto_replied_at: null,
  }),
  false
)

const dashSrc = readFileSync(join(root, 'src/app/coach/dashboard/page.tsx'), 'utf8')
assert.match(dashSrc, /checkinNeedsCoachResponse/)
assert.match(dashSrc, /checkin_type/)

console.log('✓ mid-week is not auto-replied; same-week Day 3 feeds Sunday plan generation')
