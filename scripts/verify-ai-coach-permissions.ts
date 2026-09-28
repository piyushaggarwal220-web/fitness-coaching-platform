import assert from 'node:assert/strict'
import { buildNamedCoachSystemPrompt } from '../src/lib/ai/coach-chat-persona'
import {
  formatCheckinLine,
  formatTodayPlan,
  purchasedPlanLine,
} from '../src/lib/ai/ai-coach-context'
import type { TrackerSnapshot } from '../src/lib/daily-tracker/types'

const aiPrompt = buildNamedCoachSystemPrompt({
  coachFirstName: 'Piyush',
  name: 'Asha',
  fitnessGoal: 'fat loss',
  personalities: null,
  planTitle: 'Week 2',
  journeySummary: null,
  purchasedPlanLine: purchasedPlanLine('6_months'),
  todayPlan: 'Meals: Breakfast: oats\nWorkout: Squat 3x8',
  trackerLine: 'Meals logged today: 0 of 1. Trained today: no.',
  checkinLine: 'Check-in: due now. Photos: missing.',
  dietPreference: 'Vegetarian',
  mode: 'ai_thread',
})

assert.match(aiPrompt, /My Plan/)
assert.match(aiPrompt, /Fat loss \+ muscle gain/)
assert.match(aiPrompt, /every week/)
assert.match(aiPrompt, /Vegetarian/)
assert.match(aiPrompt, /Breakfast: oats/)
assert.doesNotMatch(aiPrompt, /update shortly/)
assert.doesNotMatch(aiPrompt, /₹|per month/i)

const humanPrompt = buildNamedCoachSystemPrompt({
  coachFirstName: 'Rakshit',
  name: 'Asha',
  fitnessGoal: null,
  personalities: null,
  planTitle: null,
  journeySummary: null,
  mode: 'human_thread',
})
assert.match(humanPrompt, /My Plan/)
assert.doesNotMatch(humanPrompt, /update shortly/)

const snapshot = {
  generatedAt: '2026-09-28T00:00:00.000Z',
  planId: 'plan',
  planVersion: 1,
  planTitle: 'Week',
  items: [
    {
      id: 'mon-breakfast',
      type: 'meal',
      period: 'morning',
      icon: '',
      title: 'Breakfast',
      foods: 'oats and milk',
      dietDay: 'monday',
      sortOrder: 1,
    },
    {
      id: 'tue-breakfast',
      type: 'meal',
      period: 'morning',
      icon: '',
      title: 'Breakfast',
      foods: 'poha',
      dietDay: 'tuesday',
      sortOrder: 2,
    },
    {
      id: 'monday-workout',
      type: 'workout',
      period: 'workout',
      icon: '',
      title: 'Monday push',
      workoutDay: 'monday',
      phases: [],
      exercises: [
        {
          id: 'bench',
          name: 'Bench press',
          targetSets: 3,
          targetReps: '8',
          phase: 'main',
        },
      ],
      sortOrder: 3,
    },
  ],
  dietDays: [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
  ],
  workoutDays: [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
  ],
} as TrackerSnapshot

const day = formatTodayPlan({
  snapshot,
  completion: {
    selectedDietDay: 'monday',
    selectedWorkoutDay: 'monday',
    exercises: { bench: { completed: true, sets: [] } },
    meals: {},
  },
  coachingDayInWeek: 1,
  logged: true,
  referenceDate: new Date('2026-09-28T08:00:00+05:30'),
})
assert.match(day.todayPlan, /oats and milk/)
assert.doesNotMatch(day.todayPlan, /poha/)
assert.match(day.todayPlan, /Bench press/)
assert.match(day.trackerLine, /Meals logged today: 0 of 1/)
assert.match(day.trackerLine, /Trained today: yes/)

const photoUrl = 'https://cdn.example.com/private-photo.jpg'
const checkin = formatCheckinLine({
  scheduleStartedAt: null,
  checkins: [
    {
      checkin_type: 'weekly',
      coaching_week: 1,
      progress_photo_front: photoUrl,
      progress_photo_side: photoUrl,
      progress_photo_back: photoUrl,
      pain_injuries: null,
    },
  ],
})
assert.equal(checkin, 'Check-in: not scheduled yet. Photos: not required today.')
assert.doesNotMatch(checkin, /cdn\.example|http/)
assert.doesNotMatch(purchasedPlanLine('3_months'), /₹/)
assert.match(purchasedPlanLine('3_months'), /every 14 days/)
assert.match(purchasedPlanLine('12_months'), /weekly coach phone call/)

console.log('ai coach permissions ok')
