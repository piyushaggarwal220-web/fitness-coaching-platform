import type { Checkin, OnboardingProfile } from '@/types/database'
import type { GeneratedPlan } from '@/lib/ai/generate-plan'
import { getOnboardingLabel } from '@/lib/onboarding'

function num(value: number | string | null | undefined, fallback: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

/** Deterministic mock plan from client onboarding — valid GeneratedPlan schema. */
export function buildMockGeneratedPlan(
  profile: OnboardingProfile,
  latestCheckin?: Checkin | null,
  coachInstructions?: string | null
): GeneratedPlan {
  const name = profile.name?.trim() || 'Client'
  const goal = getOnboardingLabel('fitness_goal', profile.fitness_goal)
  const training = getOnboardingLabel('training_experience', profile.training_experience)
  const diet = getOnboardingLabel('diet_preference', profile.diet_preference)
  const weight = num(profile.weight, 70)
  const calories = Math.round(weight * 30)
  const protein = Math.round(weight * 2)

  const checkinNote = latestCheckin
    ? `Latest check-in: energy ${latestCheckin.energy_level ?? '—'}/10, adherence ${latestCheckin.adherence_score ?? '—'}/10.`
    : 'No check-in data yet — conservative starting targets.'

  const coachNote = coachInstructions?.trim()
    ? `Coach notes: ${coachInstructions.trim()}`
    : 'Mock draft — replace AI_PLAN_PROVIDER=claude when ready for live generation.'

  return {
    workout_plan: {
      overview: `${name}'s ${goal.toLowerCase()} program (${training} level). 4 training days + optional recovery.`,
      days: [
        { day: 'Monday', focus: 'Upper push', exercises: ['Bench press 4x8', 'Overhead press 3x10', 'Triceps pushdown 3x12'] },
        { day: 'Wednesday', focus: 'Lower', exercises: ['Squat 4x8', 'Romanian deadlift 3x10', 'Walking lunges 3x12'] },
        { day: 'Friday', focus: 'Upper pull', exercises: ['Lat pulldown 4x10', 'Barbell row 3x8', 'Face pulls 3x15'] },
        { day: 'Saturday', focus: 'Full body / conditioning', exercises: ['Goblet squat 3x12', 'Push-ups 3xAMRAP', 'Plank 3x45s'] },
      ],
    },
    nutrition_plan: {
      calories,
      protein,
      carbs: Math.round((calories - protein * 4 - Math.round(calories * 0.25)) / 4),
      fat: Math.round((calories * 0.25) / 9),
      meals: [
        { meal: 'Breakfast', example: `${diet} — oats, eggs, fruit` },
        { meal: 'Lunch', example: 'Lean protein, rice, vegetables' },
        { meal: 'Dinner', example: 'Protein, complex carbs, salad' },
        { meal: 'Snack', example: 'Greek yogurt or nuts' },
      ],
    },
    cardio_plan: {
      sessions: [
        { type: 'LISS walk', duration: '30 min', frequency: '3x/week' },
        { type: 'Optional intervals', duration: '15 min', frequency: '1x/week' },
      ],
    },
    supplement_plan: {
      items: [
        { name: 'Whey protein', dose: '1 scoop post-workout', notes: 'If protein target not met via food' },
        { name: 'Creatine monohydrate', dose: '5g daily', notes: 'Optional for strength goals' },
        { name: 'Vitamin D3', dose: '1000–2000 IU', notes: 'If deficient / limited sun' },
      ],
    },
    coach_notes: [coachNote, checkinNote, `Goal: ${goal}. Diet preference: ${diet}.`].join('\n\n'),
  }
}
