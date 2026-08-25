import type { Checkin, OnboardingProfile } from '@/types/database'
import type { GeneratedPlan } from '@/lib/ai/generate-plan'
import { resolveMetabolicFluxPlan } from '@/lib/ai/metabolic-flux'
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
  const flux = resolveMetabolicFluxPlan(profile)
  const calorieFactor =
    flux.level === 'high_flux' ? 34 : flux.level === 'build_up' ? 32 : 30
  const calories = Math.round(weight * calorieFactor)
  const protein = Math.round(weight * 2)

  const checkinNote = latestCheckin
    ? `Latest check-in: energy ${latestCheckin.energy_level ?? '—'}/10, adherence ${latestCheckin.adherence_score ?? '—'}/10.`
    : 'No check-in data yet — starting from onboarding flux bias.'

  const coachNote = coachInstructions?.trim()
    ? `Coach notes: ${coachInstructions.trim()}`
    : 'Mock draft — replace AI_PLAN_PROVIDER=claude when ready for live generation.'

  const days = ['Day 1 (Monday)', 'Day 2 (Tuesday)', 'Day 3 (Wednesday)', 'Day 4 (Thursday)', 'Day 5 (Friday)', 'Day 6 (Saturday)', 'Day 7 (Sunday)']
  const weeklyDiet = days
    .map(
      (day) =>
        `${day}\nBreakfast: ${diet} oats with eggs and fruit\nLunch: lean protein, rice, vegetables\nDinner: protein, complex carbs, salad\nSnack: Greek yogurt or nuts\n(P: ${protein}g | C: 180g | F: 55g | ~${calories} kcal)`
    )
    .join('\n\n')

  return {
    workout_plan: {
      overview: `${name}'s ${goal.toLowerCase()} program (${training} level, ${flux.label}). 4 training days + optional recovery.\n\nDay 1 (Monday)\nWarm-up:\nArm circles 2 sets x 15 reps\nMain Workout:\nBarbell Bench Press: 3 sets x 8 reps\nOverhead Press: 3 sets x 10 reps\nPost-Workout:\nChest Opener: 1 sets x 30s\n\nDay 2 (Tuesday)\nWarm-up:\nLeg swings 2 sets x 10 reps\nMain Workout:\nBarbell Back Squat: 3 sets x 8 reps\nDumbbell Romanian Deadlift: 3 sets x 10 reps\nPost-Workout:\nHip Flexor Stretch: 1 sets x 30s\n\nDay 3 (Wednesday)\nWarm-up:\nBand pull apart 2 sets x 15 reps\nMain Workout:\nLat Pulldown: 3 sets x 10 reps\nBarbell Row: 3 sets x 8 reps\nPost-Workout:\nLat Stretch: 1 sets x 30s\n\nDay 4 (Thursday)\nWarm-up:\nBodyweight squat 2 sets x 10 reps\nMain Workout:\nGoblet Squat: 3 sets x 12 reps\nPush Ups: 3 sets x AMRAP\nPost-Workout:\nCouch Stretch: 1 sets x 30s`,
      days: [
        { day: 'Day 1 (Monday)', focus: 'Upper push', exercises: ['Bench press 4x8', 'Overhead press 3x10', 'Triceps pushdown 3x12'] },
        { day: 'Day 2 (Tuesday)', focus: 'Lower', exercises: ['Squat 4x8', 'Romanian deadlift 3x10', 'Walking lunges 3x12'] },
        { day: 'Day 3 (Wednesday)', focus: 'Upper pull', exercises: ['Lat pulldown 4x10', 'Barbell row 3x8', 'Face pulls 3x15'] },
        { day: 'Day 4 (Thursday)', focus: 'Full body / conditioning', exercises: ['Goblet squat 3x12', 'Push-ups 3xAMRAP', 'Plank 3x45s'] },
      ],
    },
    nutrition_plan: {
      calories,
      protein,
      carbs: Math.round((calories - protein * 4 - Math.round(calories * 0.25)) / 4),
      fat: Math.round((calories * 0.25) / 9),
      meals: [
        {
          meal: 'Weekly Diet Plan',
          example: `Daily averages: ~${calories} kcal | P: ${protein}g | C: 180g | F: 55g\n\n${weeklyDiet}`,
        },
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
    coach_notes: [coachNote, checkinNote, `Goal: ${goal}. Diet preference: ${diet}. Flux: ${flux.label}.`].join('\n\n'),
  }
}
