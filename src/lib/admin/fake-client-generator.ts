import { randomBytes, randomInt } from 'node:crypto'
import {
  ACTIVITY_OPTIONS,
  DIET_OPTIONS,
  DIET_VARIETY_OPTIONS,
  FLUX_CAPACITY_OPTIONS,
  GENDER_OPTIONS,
  OCCUPATION_OPTIONS,
  SLEEP_OPTIONS,
  STEPS_OPTIONS,
  STRESS_OPTIONS,
  STRUGGLE_OPTIONS,
  TRAINING_LOCATION_OPTIONS,
  TRAINING_OPTIONS,
  TRAINING_DURATION_OPTIONS,
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

const MEALS_VEG = {
  breakfast: [
    'Poha with peanuts',
    'Idli with sambar',
    'Oats with banana and curd',
    'Paratha with curd',
    'Besan chilla with mint chutney',
  ],
  lunch: [
    'Dal, roti, and salad',
    'Paneer wrap with side salad',
    'Brown rice, rajma, and curd',
    'Khichdi with kadhi',
    'Veg pulao with raita',
  ],
  dinner: [
    'Paneer bhurji with roti',
    'Dal tadka with rice and sabzi',
    'Soya chunks curry with roti',
    'Palak paneer with 2 rotis',
    'Mixed veg with dal and rice',
  ],
  snacks: [
    'Roasted chana',
    'Apple with peanut butter',
    'Curd with fruit',
    'Peanuts and banana',
    'Sprouts chaat',
  ],
}

const MEALS_VEGAN = {
  breakfast: [
    'Poha with peanuts',
    'Idli with sambar',
    'Oats with banana and peanut butter',
    'Fruit and roasted chana',
    'Besan chilla with green chutney',
  ],
  lunch: [
    'Dal, roti, and salad',
    'Brown rice with rajma',
    'Khichdi with salad',
    'Veg pulao with chutney',
    'Soya curry with rice',
  ],
  dinner: [
    'Dal tadka with rice and sabzi',
    'Soya chunks curry with roti',
    'Mixed veg with dal and rice',
    'Chole with roti',
    'Vegetable stir-fry with rice',
  ],
  snacks: [
    'Roasted chana',
    'Apple with peanut butter',
    'Peanuts and banana',
    'Sprouts chaat',
    'Trail mix',
  ],
}

const MEALS_EGG = {
  breakfast: [
    'Eggs, toast, and black coffee',
    'Egg bhurji with 2 rotis',
    'Oats with boiled eggs',
    'Idli with sambar',
    'Poha with peanuts',
  ],
  lunch: [
    'Dal, roti, and salad',
    'Paneer wrap with side salad',
    'Brown rice, rajma, and curd',
    'Egg curry with rice',
    'Veg pulao with raita',
  ],
  dinner: [
    'Paneer bhurji with roti',
    'Dal tadka with rice and sabzi',
    'Egg curry with 2 rotis',
    'Soya chunks curry with roti',
    'Palak paneer with roti',
  ],
  snacks: [
    'Boiled eggs',
    'Roasted chana',
    'Curd with fruit',
    'Peanuts and banana',
    'Protein shake',
  ],
}

const MEALS_NONVEG = {
  breakfast: [
    'Eggs, toast, and black coffee',
    'Oats with whey and banana',
    'Poha with peanuts',
    'Idli with sambar',
    'Egg bhurji with toast',
  ],
  lunch: [
    'Chicken rice bowl with vegetables',
    'Dal, roti, and salad',
    'Grilled fish with rice',
    'Paneer wrap with side salad',
    'Brown rice, rajma, and curd',
  ],
  dinner: [
    'Grilled chicken with sweet potato',
    'Fish curry with steamed rice',
    'Paneer bhurji with roti',
    'Chicken curry with 2 rotis',
    'Dal tadka with rice and sabzi',
  ],
  snacks: [
    'Protein shake',
    'Roasted chana',
    'Apple with peanut butter',
    'Boiled eggs',
    'Curd with fruit',
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
  const path = pick([
    { bodyType: 'lose_fat_fast' as const, fitnessGoal: 'fat_loss', companionGoal: 'improve_fitness' },
    { bodyType: 'weight_gain' as const, fitnessGoal: 'muscle_gain', companionGoal: 'build_strength' },
    { bodyType: 'skinny_fat' as const, fitnessGoal: 'body_recomposition', companionGoal: 'build_consistency' },
  ])
  const fitnessGoal = path.fitnessGoal

  const fullName =
    name?.trim() ||
    `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`

  const height = String(randomHeightCm(gender))
  const weight = String(randomWeightKg(Number(height), fitnessGoal === 'body_recomposition' ? 'recomposition' : fitnessGoal))
  const targetDelta = fitnessGoal === 'muscle_gain' ? 4 : fitnessGoal === 'fat_loss' ? -6 : -2
  const targetWeight = String(Math.max(45, Math.round(Number(weight) + targetDelta)))

  const companionGoal = path.companionGoal

  const trainingLocation = pick(TRAINING_LOCATION_OPTIONS).value
  const equipment =
    trainingLocation === 'gym'
      ? pickSome(EQUIPMENT, 3, 5)
      : pickSome(['dumbbells', 'resistance bands', 'pull-up bar', 'yoga mat'], 2, 4)

  const struggle = pick(STRUGGLE_OPTIONS)

  const form: OnboardingFormData = {
    name: fullName,
    age: String(randomInt(22, 48)),
    gender,
    height,
    weight,
    chest: String(randomInt(85, 110)),
    thigh: String(randomInt(48, 65)),
    navel: String(randomInt(75, 100)),
    left_bicep: String(randomInt(28, 42)),
    right_bicep: String(randomInt(28, 42)),
    fitness_goal: fitnessGoal,
    starting_body_type: path.bodyType,
    selected_goals: [fitnessGoal, companionGoal],
    target_weight: targetWeight,
    goal_deadline: pick(['8_weeks', '12_weeks', '16_weeks', '24_weeks']),
    biggest_struggle: struggle.value,
    goal_details: '',
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
    flux_capacity: pick(FLUX_CAPACITY_OPTIONS).value,
    diet_variety: pick(DIET_VARIETY_OPTIONS).value,
    training_location: trainingLocation,
    training_experience: pick(TRAINING_OPTIONS).value,
    training_duration: pick(TRAINING_DURATION_OPTIONS).value,
    training_days_per_week: String(randomInt(3, 6)),
    workout_duration: String(pick([45, 50, 60, 75])),
    preferred_workout_time: pick(WORKOUT_TIME_OPTIONS).value,
    equipment_available: equipment,
    favorite_exercises: pick(['Squats and rows', 'Bench and pull-ups', 'Deadlifts and lunges', 'Machines and cables']),
    exercises_disliked: pick(['Burpees', 'Running', 'Overhead press', 'None in particular']),
    can_squat: pick(['yes', 'yes', 'with_modification']),
    can_pushup: pick(['yes', 'yes', 'with_modification', 'no']),
    can_pullup: pick(['yes', 'with_modification', 'no']),
    recent_program: pick([
      'None',
      'PPL 4 days/week for ~8 weeks',
      'Bro split at local gym, inconsistent last month',
      'Home dumbbell full-body 3x/week',
    ]),
    injuries: pick(['None', 'Previous knee strain — cleared for training', 'Mild shoulder tightness']),
    medical_notes: pick(MEDICAL),
    pain_during_exercise: pick(['none', 'none', 'no']),
    medications: pick(['None', 'Vitamin D', 'None']),
    acne_status: pick(['never', 'previously', 'currently']),
    hair_loss_status: pick(['never', 'previously', 'currently']),
    sexual_health_status: pick(['no_issues', 'prefer_not_to_say']),
    diet_preference: '',
    egg_days: '0',
    chicken_days: '0',
    fish_days: '0',
    egg_allowed_days: [],
    chicken_allowed_days: [],
    fish_allowed_days: [],
    whey_protein: pick(['yes', 'no']),
    food_allergies: pick(ALLERGIES),
    foods_disliked: pick(['Bitter gourd', 'Mushrooms', 'Olives', 'None']),
    previous_diets_failed: pick(['', 'Keto for 2 months — too restrictive', 'Very low calorie — lost energy']),
    favorite_foods: '',
    diet_custom_notes: '',
    monthly_food_budget: String(pick([6000, 8000, 10000, 12000, 15000])),
    cooking_ability: pick(['basic', 'intermediate', 'advanced']),
    breakfast: '',
    lunch: '',
    dinner: '',
    snacks: '',
    timing_breakfast: pick(['07:30', '08:00', '08:30']),
    timing_lunch: pick(['13:00', '13:30', '14:00']),
    timing_dinner: pick(['20:00', '20:30', '21:00']),
    timing_snacks: pick(['16:30', '18:00', '18:30']),
    current_supplements: pick(['Creatine, whey protein', 'Multivitamin, fish oil', 'None currently']),
    terms_accepted: true,
  }

  // Keep diet preference, usual meals, and favorites consistent (no random chicken for veg clients).
  const dietPreference = pick(DIET_OPTIONS).value
  form.diet_preference = dietPreference
  if (dietPreference === 'vegan') {
    const meals = MEALS_VEGAN
    form.breakfast = pick(meals.breakfast)
    form.lunch = pick(meals.lunch)
    form.dinner = pick(meals.dinner)
    form.snacks = pick(meals.snacks)
    form.favorite_foods = pick(['Dal, roti, rice', 'Soya, chana, vegetables', 'Poha, khichdi, sprouts'])
    form.whey_protein = 'no'
    form.egg_days = '0'
    form.chicken_days = '0'
    form.fish_days = '0'
    form.current_supplements = pick(['Vitamin B12, vitamin D', 'Multivitamin', 'None currently'])
  } else if (dietPreference === 'vegetarian') {
    const meals = MEALS_VEG
    form.breakfast = pick(meals.breakfast)
    form.lunch = pick(meals.lunch)
    form.dinner = pick(meals.dinner)
    form.snacks = pick(meals.snacks)
    form.favorite_foods = pick(['Paneer, roti, salad', 'Dal, rice, curd', 'Rajma, roti, sabzi'])
    form.egg_days = '0'
    form.chicken_days = '0'
    form.fish_days = '0'
  } else if (dietPreference === 'eggetarian') {
    const meals = MEALS_EGG
    form.breakfast = pick(meals.breakfast)
    form.lunch = pick(meals.lunch)
    form.dinner = pick(meals.dinner)
    form.snacks = pick(meals.snacks)
    form.favorite_foods = pick(['Eggs, roti, dal', 'Paneer, eggs, salad', 'Idli, eggs, curd'])
    form.egg_days = String(randomInt(2, 5))
    form.egg_allowed_days = ['monday', 'wednesday', 'friday', 'saturday'].slice(0, Number(form.egg_days))
    form.chicken_days = '0'
    form.fish_days = '0'
  } else {
    const meals = MEALS_NONVEG
    form.breakfast = pick(meals.breakfast)
    form.lunch = pick(meals.lunch)
    form.dinner = pick(meals.dinner)
    form.snacks = pick(meals.snacks)
    form.favorite_foods = pick(['Chicken, rice, dal', 'Fish, vegetables, oats', 'Eggs, chicken, roti'])
    form.egg_days = String(randomInt(2, 5))
    form.chicken_days = String(randomInt(1, 3))
    form.fish_days = String(randomInt(0, 2))
    form.egg_allowed_days = ['monday', 'wednesday', 'friday']
    form.chicken_allowed_days = ['tuesday', 'thursday', 'saturday']
    form.fish_allowed_days = Number(form.fish_days) > 0 ? ['wednesday', 'sunday'] : []
  }

  // Allergies must not contradict favorites / usual meals.
  if (/lactose/i.test(form.food_allergies)) {
    form.favorite_foods = pick(['Dal, roti, rice', 'Soya, chana, vegetables', 'Rajma, roti, sabzi'])
    if (/curd|paneer|milk|yogurt|whey|cheese/i.test(form.breakfast)) {
      form.breakfast = dietPreference === 'vegan' ? 'Poha with peanuts' : 'Poha with peanuts'
    }
    if (/curd|paneer|milk|yogurt|whey|cheese/i.test(form.lunch)) {
      form.lunch = 'Dal, roti, and salad'
    }
    if (/curd|paneer|milk|yogurt|whey|cheese/i.test(form.dinner)) {
      form.dinner = 'Dal tadka with rice and sabzi'
    }
    if (/curd|paneer|milk|yogurt|whey|cheese/i.test(form.snacks)) {
      form.snacks = 'Roasted chana'
    }
    form.whey_protein = 'no'
    form.current_supplements = pick(['Vitamin D', 'Multivitamin', 'None currently'])
  }
  if (/nut allergy/i.test(form.food_allergies)) {
    form.snacks = pick(['Roasted chana', 'Fruit bowl', 'Sprouts chaat'])
    if (/peanut|almond|cashew|walnut|trail mix/i.test(form.breakfast)) {
      form.breakfast = 'Idli with sambar'
    }
  }
  if (/mushroom/i.test(form.foods_disliked)) {
    // meals pool already has no mushrooms; keep favorites clean
    form.favorite_foods = form.favorite_foods.replace(/mushrooms?/gi, 'vegetables')
  }

  return form
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
