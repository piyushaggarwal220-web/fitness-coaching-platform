import type { Checkin, OnboardingProfile } from '@/types/database'
import type { GeneratedPlan } from '@/lib/ai/generate-plan'
import { resolveMetabolicFluxPlan } from '@/lib/ai/metabolic-flux'
import { computeNutritionTargets } from '@/lib/ai/nutrition-targets'
import { getOnboardingLabel } from '@/lib/onboarding'

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
  const flux = resolveMetabolicFluxPlan(profile)
  const targets = computeNutritionTargets(profile, latestCheckin)
  const calories = targets.calories
  const protein = targets.protein
  const carbs = targets.carbs
  const fat = targets.fat

  const checkinNote = latestCheckin
    ? `Latest check-in: energy ${latestCheckin.energy_level ?? '—'}/10, adherence ${latestCheckin.adherence_score ?? '—'}/10.`
    : 'No check-in data yet — starting from onboarding flux bias.'

  const coachNote = coachInstructions?.trim()
    ? `Coach notes: ${coachInstructions.trim()}`
    : 'Mock draft — replace AI_PLAN_PROVIDER=claude when ready for live generation.'

  // Split daily macros across 4 meals so meal-line verification passes.
  const mealP = [
    Math.round(protein * 0.3),
    Math.round(protein * 0.3),
    Math.round(protein * 0.25),
    protein - Math.round(protein * 0.3) - Math.round(protein * 0.3) - Math.round(protein * 0.25),
  ]
  const mealC = [
    Math.round(carbs * 0.3),
    Math.round(carbs * 0.35),
    Math.round(carbs * 0.25),
    carbs - Math.round(carbs * 0.3) - Math.round(carbs * 0.35) - Math.round(carbs * 0.25),
  ]
  const mealF = [
    Math.round(fat * 0.25),
    Math.round(fat * 0.3),
    Math.round(fat * 0.3),
    fat - Math.round(fat * 0.25) - Math.round(fat * 0.3) - Math.round(fat * 0.3),
  ]
  const mealNames = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
  const days = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']
  const weeklyDiet = days
    .map((day) => {
      const lines = mealNames.map((mealName, idx) => {
        const p = mealP[idx]!
        const c = mealC[idx]!
        const f = mealF[idx]!
        const kcal = p * 4 + c * 4 + f * 9
        return `${mealName}: ${diet} balanced option with protein, carbs, and veg\n(P: ${p}g | C: ${c}g | F: ${f}g | ~${kcal} kcal)`
      })
      return `${day}\n${lines.join('\n')}\nDaily Total: P: ${protein}g | C: ${carbs}g | F: ${fat}g | ~${calories} kcal`
    })
    .join('\n\n')

  return {
    workout_plan: {
      overview: `${name}'s ${goal.toLowerCase()} program (${training} level, ${flux.label}). 4 training days + optional recovery.\n\nDay 1\nBench press 4 sets x 8 reps\nOverhead press 3 sets x 10 reps\n\nDay 2\nSquat 4 sets x 8 reps\nRomanian deadlift 3 sets x 10 reps\n\nDay 3\nLat pulldown 4 sets x 10 reps\nBarbell row 3 sets x 8 reps\n\nDay 4\nGoblet squat 3 sets x 12 reps\nPush ups 3 sets x AMRAP`,
      days: [
        { day: 'Day 1', focus: 'Upper push', exercises: ['Bench press 4x8', 'Overhead press 3x10', 'Triceps pushdown 3x12'] },
        { day: 'Day 2', focus: 'Lower', exercises: ['Squat 4x8', 'Romanian deadlift 3x10', 'Walking lunges 3x12'] },
        { day: 'Day 3', focus: 'Upper pull', exercises: ['Lat pulldown 4x10', 'Barbell row 3x8', 'Face pulls 3x15'] },
        { day: 'Day 4', focus: 'Full body / conditioning', exercises: ['Goblet squat 3x12', 'Push-ups 3xAMRAP', 'Plank 3x45s'] },
      ],
    },
    nutrition_plan: {
      calories,
      protein,
      carbs,
      fat,
      meals: [
        {
          meal: 'Weekly Diet Plan',
          example: `Daily averages: ~${calories} kcal | P: ${protein}g | C: ${carbs}g | F: ${fat}g\n\n${weeklyDiet}`,
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
