import { randomBytes, randomInt } from 'node:crypto'
import {
  ACTIVITY_OPTIONS,
  DIET_OPTIONS,
  FITNESS_GOAL_OPTIONS,
  GENDER_OPTIONS,
  OCCUPATION_OPTIONS,
  SLEEP_OPTIONS,
  STEPS_OPTIONS,
  STRESS_OPTIONS,
  STRUGGLE_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  TRAINING_OPTIONS,
  WATER_OPTIONS,
  WORKOUT_TIME_OPTIONS,
  buildProfilePayload,
  ONBOARDING_SCREEN_COUNT,
} from '@/lib/onboarding'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingFormData } from '@/types/database'

const FIRST_NAMES = [
  'Aarav',
  'Priya',
  'Rohan',
  'Ananya',
  'Vikram',
  'Neha',
  'Arjun',
  'Kavya',
  'Dev',
  'Meera',
  'Karan',
  'Isha',
  'Rahul',
  'Sneha',
  'Aditya',
]

const LAST_NAMES = [
  'Sharma',
  'Patel',
  'Iyer',
  'Reddy',
  'Gupta',
  'Singh',
  'Nair',
  'Mehta',
  'Kapoor',
  'Das',
  'Verma',
  'Joshi',
]

const EQUIPMENT = [
  'dumbbells',
  'barbell',
  'resistance bands',
  'pull-up bar',
  'bench',
  'cables',
  'kettlebell',
  'treadmill',
]

const MEALS = {
  breakfast: [
    'Oats with whey and banana',
    'Eggs, toast, and black coffee',
    'Poha with peanuts',
    'Greek yogurt with berries',
    'Idli with sambar',
  ],
  lunch: [
    'Chicken rice bowl with vegetables',
    'Dal, roti, and salad',
    'Grilled fish with quinoa',
    'Paneer wrap with side salad',
    'Brown rice, rajma, and curd',
  ],
  dinner: [
    'Grilled chicken with sweet potato',
    'Tofu stir-fry with rice',
    'Fish curry with steamed rice',
    'Paneer bhurji with roti',
    'Lean mince with vegetables',
  ],
  snacks: [
    'Protein shake',
    'Roasted chana',
    'Apple with peanut butter',
    'Trail mix',
    'Cottage cheese with fruit',
  ],
}

const ALLERGIES = ['None', 'Lactose intolerant', 'Gluten sensitivity', 'Nut allergy']
const MEDICAL = ['None', 'Mild lower back stiffness', 'Seasonal allergies', 'Controlled hypertension']

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)]!
}

function pickSome(items: readonly string[], min: number, max: number): string[] {
  const count = randomInt(min, max + 1)
  const pool = [...items]
  const selected: string[] = []
  while (selected.length < count && pool.length > 0) {
    const index = randomInt(pool.length)
    selected.push(pool.splice(index, 1)[0]!)
  }
  return selected
}

function randomHeightCm(gender: string): number {
  if (gender === 'male') return randomInt(165, 191)
  if (gender === 'female') return randomInt(152, 178)
  return randomInt(158, 185)
}

function randomWeightKg(heightCm: number, goal: string): number {
  const bmiBase = goal === 'muscle_gain' ? 24 : goal === 'fat_loss' ? 27 : 25
  const weight = Math.round((bmiBase * (heightCm / 100) ** 2) * 10) / 10
  return Math.max(48, Math.min(120, weight))
}

export function generateFakeClientEmail(): string {
  const suffix = randomBytes(4).toString('hex')
  return `trial-${Date.now().toString(36)}-${suffix}@trial.test.local`
}

export function generateFakeOnboardingForm(name?: string): OnboardingFormData {
  const gender = pick(GENDER_OPTIONS).value
  const fitnessGoal = pick([
    FITNESS_GOAL_OPTIONS.find((o) => o.value === 'fat_loss')!,
    FITNESS_GOAL_OPTIONS.find((o) => o.value === 'muscle_gain')!,
    FITNESS_GOAL_OPTIONS.find((o) => o.value === 'recomposition')!,
  ]).value

  const fullName =
    name?.trim() ||
    `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`

  const height = String(randomHeightCm(gender))
  const weight = String(randomWeightKg(Number(height), fitnessGoal))
  const targetDelta = fitnessGoal === 'muscle_gain' ? 4 : fitnessGoal === 'fat_loss' ? -6 : -2
  const targetWeight = String(Math.max(45, Math.round(Number(weight) + targetDelta)))

  const trainingLocation = pick(TRAINING_LOCATION_OPTIONS).value
  const equipment =
    trainingLocation === 'gym'
      ? pickSome(EQUIPMENT, 3, 5)
      : pickSome(['dumbbells', 'resistance bands', 'pull-up bar', 'yoga mat'], 2, 4)

  const struggle = pick(STRUGGLE_OPTIONS)

  return {
    name: fullName,
    age: String(randomInt(22, 48)),
    gender,
    height,
    weight,
    chest: String(randomInt(85, 110)),
    thigh: String(randomInt(48, 65)),
    navel: String(randomInt(75, 100)),
    fitness_goal: fitnessGoal,
    target_weight: targetWeight,
    goal_deadline: pick(['8_weeks', '12_weeks', '16_weeks', '24_weeks']),
    biggest_struggle: struggle.value,
    occupation: pick(OCCUPATION_OPTIONS).value,
    work_school_schedule: pick([
      'Office 10am–7pm Mon–Fri, commute ~45 min each way. Free evenings after 8pm. Sundays off.',
      'College classes 9am–2pm weekdays. Study till 5pm. Gym preferred mornings before class.',
      'Night shift 10pm–6am four days a week. Sleep mid-morning. Free afternoons on off days.',
    ]),
    activity_level: pick(ACTIVITY_OPTIONS).value,
    daily_steps: pick(STEPS_OPTIONS).value,
    sleep_duration: pick(SLEEP_OPTIONS).value,
    stress_level: pick(STRESS_OPTIONS).value,
    water_intake: pick(WATER_OPTIONS).value,
    training_location: trainingLocation,
    training_experience: pick(TRAINING_OPTIONS).value,
    training_days_per_week: String(randomInt(3, 6)),
    workout_duration: String(pick([45, 50, 60, 75])),
    preferred_workout_time: pick(WORKOUT_TIME_OPTIONS).value,
    equipment_available: equipment,
    favorite_exercises: pick(['Squats and rows', 'Bench and pull-ups', 'Deadlifts and lunges', 'Machines and cables']),
    exercises_disliked: pick(['Burpees', 'Running', 'Overhead press', 'None in particular']),
    injuries: pick(['None', 'Previous knee strain — cleared for training', 'Mild shoulder tightness']),
    medical_notes: pick(MEDICAL),
    pain_during_exercise: pick(['none', 'none', 'no']),
    medications: pick(['None', 'Vitamin D', 'None']),
    acne_status: pick(['never', 'previously', 'currently']),
    hair_loss_status: pick(['never', 'previously', 'currently']),
    sexual_health_status: pick(['no_issues', 'prefer_not_to_say']),
    diet_preference: pick(DIET_OPTIONS).value,
    egg_days: String(randomInt(0, 7)),
    chicken_days: String(randomInt(0, 5)),
    fish_days: String(randomInt(0, 4)),
    egg_allowed_days: ['monday', 'wednesday', 'friday'],
    chicken_allowed_days: ['tuesday', 'thursday', 'saturday'],
    fish_allowed_days: ['wednesday', 'sunday'],
    whey_protein: pick(['yes', 'no']),
    food_allergies: pick(ALLERGIES),
    foods_disliked: pick(['Bitter gourd', 'Mushrooms', 'Olives', 'None']),
    favorite_foods: pick(['Chicken, rice, dal', 'Paneer, roti, salad', 'Fish, vegetables, oats']),
    monthly_food_budget: String(pick([6000, 8000, 10000, 12000, 15000])),
    cooking_ability: pick(['basic', 'intermediate', 'advanced']),
    breakfast: pick(MEALS.breakfast),
    lunch: pick(MEALS.lunch),
    dinner: pick(MEALS.dinner),
    snacks: pick(MEALS.snacks),
    timing_breakfast: pick(['07:30', '08:00', '08:30']),
    timing_lunch: pick(['13:00', '13:30', '14:00']),
    timing_dinner: pick(['20:00', '20:30', '21:00']),
    timing_snacks: pick(['16:30', '18:00', '18:30']),
    current_supplements: pick(['Creatine, whey protein', 'Multivitamin, fish oil', 'None currently']),
    terms_accepted: true,
  }
}

/** Apply completed onboarding to an existing trial client profile. */
export async function applyCompletedOnboarding(
  clientId: string,
  email: string,
  form: OnboardingFormData
): Promise<void> {
  const admin = createAdminClient()

  const payload = buildProfilePayload(form, clientId, {
    email,
    resumeStep: ONBOARDING_SCREEN_COUNT - 1,
    complete: true,
  })

  const { error } = await admin.from('profiles').update(payload).eq('id', clientId)
  if (error) throw new Error(`Failed to complete onboarding: ${error.message}`)
}
