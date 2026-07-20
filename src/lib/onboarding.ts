import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import {
  ensureAuthSession,
  fetchClientProfile,
  getRoleHomePath,
  isDefinitivelyOnboardingIncomplete,
  isOnboardingComplete,
  redirectToLogin,
  restoreSession,
} from '@/lib/session-restore'
import { shouldBypassPaymentGuardClient } from '@/lib/dev-mode'
import { hasClientEntitlement } from '@/lib/entitlements'
import { inferFitnessGoal } from '@/lib/ai/goal-inference'
import { invalidateForEvent } from '@/lib/ai/prompt-cache'
import type {
  OnboardingData,
  OnboardingFormData,
  OnboardingProfile,
} from '@/types/database'

export const ONBOARDING_PHOTO_BUCKET = 'onboarding-photos'

export const ONBOARDING_SCREEN_COUNT = 23

export const ONBOARDING_SECTIONS = [
  'Basic',
  'Goals',
  'Lifestyle',
  'Training',
  'Medical',
  'Diet',
  'Eating',
  'Supplements',
  'Photos',
  'Review',
] as const

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const

export const FITNESS_GOAL_OPTIONS = [
  { value: 'fat_loss', label: 'Fat Loss' },
  { value: 'muscle_gain', label: 'Muscle Gain' },
  { value: 'recomposition', label: 'Recomposition' },
  { value: 'strength', label: 'Strength' },
  { value: 'athletic_performance', label: 'Athletic Performance' },
  { value: 'ai_decide', label: "I'm not sure yet (Help me decide)" },
] as const

export const ACNE_OPTIONS = [
  { value: 'never', label: 'Never had acne' },
  { value: 'previously', label: 'Had acne previously' },
  { value: 'currently', label: 'Currently have acne' },
] as const

export const HAIR_LOSS_OPTIONS = [
  { value: 'never', label: 'Never experienced hair loss' },
  { value: 'previously', label: 'Had hair loss previously' },
  { value: 'currently', label: 'Currently experiencing hair loss' },
] as const

export const SEXUAL_HEALTH_OPTIONS = [
  { value: 'no_issues', label: 'No issues' },
  { value: 'previously', label: 'Previously experienced sexual issues' },
  { value: 'currently', label: 'Currently experiencing sexual issues' },
  { value: 'prefer_not_to_say', label: 'Prefer not to answer' },
] as const

export const GOAL_DEADLINE_OPTIONS = [
  { value: '8_weeks', label: '8 weeks' },
  { value: '12_weeks', label: '12 weeks' },
  { value: '16_weeks', label: '16 weeks' },
  { value: '24_weeks', label: '24 weeks' },
  { value: 'flexible', label: 'Flexible / no fixed date' },
] as const

export const STRUGGLE_OPTIONS = [
  { value: 'consistency', label: 'Staying consistent' },
  { value: 'nutrition', label: 'Nutrition & cravings' },
  { value: 'time', label: 'Limited time' },
  { value: 'motivation', label: 'Motivation' },
  { value: 'injury', label: 'Injuries or pain' },
  { value: 'sleep_stress', label: 'Sleep or stress' },
  { value: 'other', label: 'Something else' },
] as const

export const OCCUPATION_OPTIONS = [
  { value: 'desk_job', label: 'Desk / office job' },
  { value: 'standing_job', label: 'Standing / retail' },
  { value: 'physical_job', label: 'Physical / labour' },
  { value: 'shift_work', label: 'Shift work' },
  { value: 'student', label: 'Student' },
  { value: 'homemaker', label: 'Homemaker' },
  { value: 'other', label: 'Other' },
] as const

export const TRAINING_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const

export const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary' },
  { value: 'lightly_active', label: 'Lightly Active' },
  { value: 'moderately_active', label: 'Moderately Active' },
  { value: 'very_active', label: 'Very Active' },
] as const

export const STEPS_OPTIONS = [
  { value: 'under_3000', label: 'Under 3,000' },
  { value: '3000_6000', label: '3,000 – 6,000' },
  { value: '6000_10000', label: '6,000 – 10,000' },
  { value: 'over_10000', label: '10,000+' },
] as const

export const DIET_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'non_vegetarian', label: 'Non-Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
] as const

export const SLEEP_OPTIONS = [
  { value: 'less_than_6', label: 'Less than 6 hours' },
  { value: '6_to_7', label: '6–7 hours' },
  { value: '7_to_8', label: '7–8 hours' },
  { value: '8_plus', label: '8+ hours' },
] as const

export const STRESS_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
  { value: 'very_high', label: 'Very high' },
] as const

export const WATER_OPTIONS = [
  { value: 'under_1L', label: 'Under 1 L' },
  { value: '1_2L', label: '1–2 L' },
  { value: '2_3L', label: '2–3 L' },
  { value: 'over_3L', label: '3 L+' },
] as const

export const TRAINING_LOCATION_OPTIONS = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
  { value: 'both', label: 'Both' },
] as const

export const DAYS_PER_WEEK_OPTIONS = [
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '4', label: '4 days' },
  { value: '5', label: '5 days' },
  { value: '6', label: '6 days' },
  { value: '7', label: '7 days' },
] as const

export const WORKOUT_DURATION_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '75', label: '75 min' },
  { value: '90', label: '90+ min' },
] as const

export const WORKOUT_TIME_OPTIONS = [
  { value: 'early_morning', label: 'Early morning' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
] as const

export const EQUIPMENT_OPTIONS = [
  { value: 'full_gym', label: 'Full gym access' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell & rack' },
  { value: 'resistance_bands', label: 'Resistance bands' },
  { value: 'pull_up_bar', label: 'Pull-up bar' },
  { value: 'bench', label: 'Bench' },
  { value: 'cardio_machines', label: 'Cardio machines' },
  { value: 'bodyweight_only', label: 'Bodyweight only' },
] as const

export const PROTEIN_DAYS_OPTIONS = [
  { value: '0', label: '0 days' },
  { value: '1', label: '1 day' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '4', label: '4 days' },
  { value: '5', label: '5 days' },
  { value: '6', label: '6 days' },
  { value: '7', label: '7 days' },
  { value: 'na', label: 'N/A' },
] as const

export const WHEY_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'sometimes', label: 'Sometimes' },
] as const

export const BUDGET_OPTIONS = [
  { value: 'under_5000', label: 'Under ₹5,000' },
  { value: '5000_8000', label: '₹5,000 – ₹8,000' },
  { value: '8000_12000', label: '₹8,000 – ₹12,000' },
  { value: 'over_12000', label: '₹12,000+' },
] as const

export const COOKING_OPTIONS = [
  { value: 'minimal', label: 'Minimal / mostly eating out' },
  { value: 'basic', label: 'Basic meals' },
  { value: 'comfortable', label: 'Comfortable cooking' },
  { value: 'advanced', label: 'Enjoy cooking' },
] as const

export const MEAL_TIMING_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snacks' },
] as const

export const PAIN_OPTIONS = [
  { value: 'none', label: 'No pain' },
  { value: 'yes', label: 'Yes, during some exercises' },
] as const

export const ONBOARDING_LABELS: Record<string, Record<string, string>> = {
  gender: Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label])),
  fitness_goal: Object.fromEntries(FITNESS_GOAL_OPTIONS.map((o) => [o.value, o.label])),
  training_experience: Object.fromEntries(TRAINING_OPTIONS.map((o) => [o.value, o.label])),
  activity_level: Object.fromEntries(ACTIVITY_OPTIONS.map((o) => [o.value, o.label])),
  diet_preference: Object.fromEntries(DIET_OPTIONS.map((o) => [o.value, o.label])),
  sleep_duration: Object.fromEntries(SLEEP_OPTIONS.map((o) => [o.value, o.label])),
  goal_deadline: Object.fromEntries(GOAL_DEADLINE_OPTIONS.map((o) => [o.value, o.label])),
  occupation: Object.fromEntries(OCCUPATION_OPTIONS.map((o) => [o.value, o.label])),
  daily_steps: Object.fromEntries(STEPS_OPTIONS.map((o) => [o.value, o.label])),
  stress_level: Object.fromEntries(STRESS_OPTIONS.map((o) => [o.value, o.label])),
  water_intake: Object.fromEntries(WATER_OPTIONS.map((o) => [o.value, o.label])),
  training_location: Object.fromEntries(TRAINING_LOCATION_OPTIONS.map((o) => [o.value, o.label])),
  workout_duration: Object.fromEntries(WORKOUT_DURATION_OPTIONS.map((o) => [o.value, o.label])),
  preferred_workout_time: Object.fromEntries(WORKOUT_TIME_OPTIONS.map((o) => [o.value, o.label])),
  whey_protein: Object.fromEntries(WHEY_OPTIONS.map((o) => [o.value, o.label])),
  monthly_food_budget: Object.fromEntries(BUDGET_OPTIONS.map((o) => [o.value, o.label])),
  cooking_ability: Object.fromEntries(COOKING_OPTIONS.map((o) => [o.value, o.label])),
}

export function getOnboardingLabel(field: string, value: string | null | undefined): string {
  if (!value) return 'Not set'
  return ONBOARDING_LABELS[field]?.[value] ?? value.replace(/_/g, ' ')
}

export const INITIAL_ONBOARDING_FORM: OnboardingFormData = {
  name: '',
  age: '',
  gender: '',
  height: '',
  weight: '',
  fitness_goal: '',
  target_weight: '',
  goal_deadline: '',
  biggest_struggle: '',
  occupation: '',
  activity_level: '',
  daily_steps: '',
  sleep_duration: '',
  stress_level: '',
  water_intake: '',
  training_location: '',
  training_experience: '',
  training_days_per_week: '',
  workout_duration: '',
  preferred_workout_time: '',
  equipment_available: [],
  favorite_exercises: '',
  exercises_disliked: '',
  injuries: '',
  medical_notes: '',
  pain_during_exercise: '',
  medications: '',
  acne_status: '',
  hair_loss_status: '',
  sexual_health_status: '',
  diet_preference: '',
  egg_days: '',
  chicken_days: '',
  fish_days: '',
  whey_protein: '',
  food_allergies: '',
  foods_disliked: '',
  favorite_foods: '',
  monthly_food_budget: '',
  cooking_ability: '',
  breakfast: '',
  lunch: '',
  dinner: '',
  snacks: '',
  timing_breakfast: '',
  timing_lunch: '',
  timing_dinner: '',
  timing_snacks: '',
  current_supplements: '',
  terms_accepted: false,
}

export type SavedPhotoUrls = {
  front: string | null
  side: string | null
  back: string | null
}

export type OnboardingPhotoFiles = {
  front: File | null
  side: File | null
  back: File | null
}

function parseOnboardingData(raw: unknown): OnboardingData | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as OnboardingData
}

export function formFromProfile(profile: OnboardingProfile): OnboardingFormData {
  const data = parseOnboardingData(profile.onboarding_data) ?? { version: 1, resumeStep: 0 }

  return {
    ...INITIAL_ONBOARDING_FORM,
    name: profile.name ?? '',
    age: profile.age != null ? String(profile.age) : '',
    gender: profile.gender ?? '',
    height: profile.height != null ? String(profile.height) : '',
    weight: profile.weight != null ? String(profile.weight) : '',
    fitness_goal: profile.fitness_goal ?? '',
    training_experience: profile.training_experience ?? '',
    activity_level: profile.activity_level ?? '',
    diet_preference: profile.diet_preference ?? '',
    injuries: profile.injuries ?? '',
    medical_notes: data.medical?.conditions ?? profile.medical_notes ?? '',
    sleep_duration: profile.sleep_duration ?? '',
    terms_accepted: Boolean(profile.terms_accepted_at),
    target_weight: data.goals?.targetWeight != null ? String(data.goals.targetWeight) : '',
    goal_deadline: data.goals?.deadline ?? '',
    biggest_struggle: data.goals?.biggestStruggle ?? '',
    occupation: data.lifestyle?.occupation ?? '',
    daily_steps: data.lifestyle?.dailySteps ?? '',
    stress_level: data.lifestyle?.stressLevel ?? '',
    water_intake: data.lifestyle?.waterIntake ?? '',
    training_location: data.training?.location ?? '',
    training_days_per_week: data.training?.daysPerWeek != null ? String(data.training.daysPerWeek) : '',
    workout_duration: data.training?.durationMinutes ?? '',
    preferred_workout_time: data.training?.preferredTime ?? '',
    equipment_available: data.training?.equipmentAvailable ?? [],
    favorite_exercises: data.training?.favoriteExercises ?? '',
    exercises_disliked: data.training?.exercisesDisliked ?? '',
    pain_during_exercise: data.medical?.painDuringExercise ?? '',
    medications: data.medical?.medications ?? '',
    acne_status: data.medical?.acne ?? '',
    hair_loss_status: data.medical?.hairLoss ?? '',
    sexual_health_status: data.medical?.sexualHealth ?? '',
    egg_days: data.diet?.eggDaysPerWeek ?? '',
    chicken_days: data.diet?.chickenDaysPerWeek ?? '',
    fish_days: data.diet?.fishDaysPerWeek ?? '',
    whey_protein: data.diet?.wheyProtein ?? '',
    food_allergies: data.diet?.allergies ?? '',
    foods_disliked: data.diet?.foodsDisliked ?? '',
    favorite_foods: data.diet?.favoriteFoods ?? '',
    monthly_food_budget: data.diet?.monthlyFoodBudget ?? '',
    cooking_ability: data.diet?.cookingAbility ?? '',
    breakfast: data.eatingPattern?.breakfast ?? '',
    lunch: data.eatingPattern?.lunch ?? '',
    dinner: data.eatingPattern?.dinner ?? '',
    snacks: data.eatingPattern?.snacks ?? '',
    timing_breakfast: data.eatingPattern?.timings?.breakfast ?? '',
    timing_lunch: data.eatingPattern?.timings?.lunch ?? '',
    timing_dinner: data.eatingPattern?.timings?.dinner ?? '',
    timing_snacks: data.eatingPattern?.timings?.snacks ?? '',
    current_supplements: data.supplements?.current ?? '',
  }
}

export function getResumeStep(profile: OnboardingProfile | null): number {
  if (profile?.onboarding_complete) {
    return ONBOARDING_SCREEN_COUNT - 1
  }
  const step = profile?.onboarding_data?.resumeStep
  if (typeof step === 'number' && step >= 0 && step < ONBOARDING_SCREEN_COUNT) {
    return step
  }
  return 0
}

export function buildOnboardingData(
  form: OnboardingFormData,
  resumeStep: number,
  options?: { inferredGoal?: string; aiSelectedGoal?: boolean }
): OnboardingData {
  const userUnsure = form.fitness_goal === 'ai_decide'
  return {
    version: 1,
    resumeStep,
    lastSavedAt: new Date().toISOString(),
    goals: {
      deadline: form.goal_deadline || null,
      biggestStruggle: form.biggest_struggle.trim() || null,
      goalSelectionMethod: userUnsure || options?.aiSelectedGoal ? 'ai' : 'user',
      aiSelectedGoal: userUnsure || options?.aiSelectedGoal ? true : undefined,
      userIndicatedUnsure: userUnsure ? true : undefined,
      inferredGoal: options?.inferredGoal ?? null,
    },
    lifestyle: {
      occupation: form.occupation || null,
      dailySteps: form.daily_steps || null,
      stressLevel: form.stress_level || null,
      waterIntake: form.water_intake || null,
    },
    training: {
      location: form.training_location || null,
      daysPerWeek: form.training_days_per_week || null,
      durationMinutes: form.workout_duration || null,
      preferredTime: form.preferred_workout_time || null,
      equipmentAvailable: form.equipment_available.length > 0 ? form.equipment_available : null,
      favoriteExercises: form.favorite_exercises.trim() || null,
      exercisesDisliked: form.exercises_disliked.trim() || null,
    },
    medical: {
      conditions: form.medical_notes.trim() || null,
      painDuringExercise: form.pain_during_exercise || null,
      medications: form.medications.trim() || null,
      acne: form.acne_status || null,
      hairLoss: form.hair_loss_status || null,
      sexualHealth: form.sexual_health_status || null,
    },
    diet: {
      eggDaysPerWeek: form.egg_days || null,
      chickenDaysPerWeek: form.chicken_days || null,
      fishDaysPerWeek: form.fish_days || null,
      wheyProtein: form.whey_protein || null,
      allergies: form.food_allergies.trim() || null,
      foodsDisliked: form.foods_disliked.trim() || null,
      favoriteFoods: form.favorite_foods.trim() || null,
      monthlyFoodBudget: form.monthly_food_budget || null,
      cookingAbility: form.cooking_ability || null,
    },
    eatingPattern: {
      breakfast: form.breakfast.trim() || null,
      lunch: form.lunch.trim() || null,
      dinner: form.dinner.trim() || null,
      snacks: form.snacks.trim() || null,
      timings: {
        breakfast: form.timing_breakfast || null,
        lunch: form.timing_lunch || null,
        dinner: form.timing_dinner || null,
        snacks: form.timing_snacks || null,
      },
    },
    supplements: {
      current: form.current_supplements.trim() || null,
    },
  }
}

/** Combine health fields for the profile column the AI prompt already reads. */
export function buildMedicalNotesForProfile(form: OnboardingFormData): string | null {
  const parts: string[] = []
  if (form.medical_notes.trim()) parts.push(form.medical_notes.trim())
  if (form.medications.trim()) parts.push(`Medications: ${form.medications.trim()}`)
  if (form.pain_during_exercise && form.pain_during_exercise !== 'none') {
    parts.push(`Pain during exercise: ${form.pain_during_exercise === 'yes' ? 'Yes' : form.pain_during_exercise}`)
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

export function buildProfilePayload(
  form: OnboardingFormData,
  userId: string,
  options: {
    email?: string | null
    resumeStep: number
    complete?: boolean
    photoUrls?: SavedPhotoUrls
  }
): Record<string, unknown> {
  const now = new Date().toISOString()

  let resolvedGoal = form.fitness_goal || null
  let aiSelectedGoal = false
  let inferredGoal: string | undefined

  if (options.complete && form.fitness_goal === 'ai_decide') {
    const inference = inferFitnessGoal(form)
    resolvedGoal = inference.goal
    aiSelectedGoal = true
    inferredGoal = inference.goal
  }

  const payload: Record<string, unknown> = {
    id: userId,
    email: options.email ?? null,
    name: form.name.trim(),
    age: form.age ? Number(form.age) : null,
    gender: form.gender || null,
    height: form.height ? Number(form.height) : null,
    weight: form.weight ? Number(form.weight) : null,
    fitness_goal: resolvedGoal,
    training_experience: form.training_experience || null,
    activity_level: form.activity_level || null,
    diet_preference: form.diet_preference || null,
    injuries: form.injuries.trim() || null,
    medical_notes: buildMedicalNotesForProfile(form),
    sleep_duration: form.sleep_duration || null,
    onboarding_data: buildOnboardingData(form, options.resumeStep, {
      inferredGoal,
      aiSelectedGoal,
    }),
    updated_at: now,
  }

  if (options.photoUrls?.front) payload.progress_photo_front = options.photoUrls.front
  if (options.photoUrls?.side) payload.progress_photo_side = options.photoUrls.side
  if (options.photoUrls?.back) payload.progress_photo_back = options.photoUrls.back

  if (options.complete) {
    payload.onboarding_complete = true
    payload.onboarding_completed_at = now
    payload.terms_accepted_at = now
    payload.onboarding_data = buildOnboardingData(form, ONBOARDING_SCREEN_COUNT - 1, {
      inferredGoal,
      aiSelectedGoal,
    })
  }

  return payload
}

function formatStruggle(value: string): string {
  if (!value.trim()) return 'Not specified'
  const [chip, ...rest] = value.split('|')
  const chipLabel = STRUGGLE_OPTIONS.find((o) => o.value === chip)?.label
  const detail = rest.join('|').trim()
  if (chipLabel && detail) return `${chipLabel} — ${detail}`
  if (chipLabel) return chipLabel
  return value.replace(/\|/g, ' — ')
}

function needsTargetWeight(_goal: string): boolean {
  return false
}

/** Format HH:mm time string for display (24-hour clock). */
export function formatMealTime24(value: string): string {
  if (!value) return 'Not set'
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return value
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function needsEquipment(location: string): boolean {
  return location === 'home' || location === 'both'
}

export function validateOnboardingStep(
  step: number,
  data: OnboardingFormData,
  photos?: OnboardingPhotoFiles,
  savedPhotoUrls?: SavedPhotoUrls,
  mealTimingContext?: {
    mealsForTiming: string[]
    confirmedMeals: string[]
  }
): string | null {
  switch (step) {
    case 0: {
      if (!data.name.trim()) return 'Please enter your name.'
      const age = Number(data.age)
      if (!data.age || Number.isNaN(age) || age < 13 || age > 100) return 'Enter a valid age (13–100).'
      return null
    }
    case 1: {
      if (!data.gender) return 'Please select your gender.'
      if (!data.height || Number(data.height) <= 0) return 'Enter a valid height in cm.'
      if (!data.weight || Number(data.weight) <= 0) return 'Enter a valid weight in kg.'
      return null
    }
    case 2: {
      if (!data.fitness_goal) return 'Please select your primary goal.'
      if (needsTargetWeight(data.fitness_goal)) {
        if (!data.target_weight || Number(data.target_weight) <= 0) return 'Enter a valid target weight.'
      }
      return null
    }
    case 3: {
      if (!data.goal_deadline) return 'Please select a goal deadline.'
      const struggle = data.biggest_struggle.trim()
      if (!struggle) return 'Please share your biggest struggle.'
      const chip = struggle.split('|')[0]
      if (!STRUGGLE_OPTIONS.some((o) => o.value === chip) && struggle.length < 3) {
        return 'Please select a struggle or describe it briefly.'
      }
      return null
    }
    case 4: {
      if (!data.occupation) return 'Please select your occupation.'
      if (!data.activity_level) return 'Please select your activity level.'
      return null
    }
    case 5: {
      if (!data.daily_steps) return 'Please estimate your daily steps.'
      if (!data.sleep_duration) return 'Please select your sleep duration.'
      return null
    }
    case 6: {
      if (!data.stress_level) return 'Please select your stress level.'
      if (!data.water_intake) return 'Please select your water intake.'
      return null
    }
    case 7: {
      if (!data.training_location) return 'Please select where you train.'
      if (!data.training_experience) return 'Please select your training experience.'
      return null
    }
    case 8: {
      if (!data.training_days_per_week) return 'Please select training days per week.'
      if (!data.workout_duration) return 'Please select workout duration.'
      if (!data.preferred_workout_time) return 'Please select preferred workout time.'
      return null
    }
    case 9: {
      if (needsEquipment(data.training_location) && data.equipment_available.length === 0) {
        return 'Please select available equipment.'
      }
      return null
    }
    case 10:
      return null
    case 11: {
      if (!data.acne_status) return 'Please answer the acne question.'
      if (!data.hair_loss_status) return 'Please answer the hair loss question.'
      if (!data.sexual_health_status) return 'Please answer the sexual health question.'
      return null
    }
    case 12: {
      if (!data.pain_during_exercise) return 'Please indicate if you experience pain during exercise.'
      return null
    }
    case 13: {
      if (!data.diet_preference) return 'Please select your diet type.'
      return null
    }
    case 14: {
      if (!data.whey_protein) return 'Please indicate whey protein usage.'
      return null
    }
    case 15:
      return null
    case 16: {
      if (!data.monthly_food_budget.trim()) return 'Please enter your monthly food budget.'
      if (!data.cooking_ability) return 'Please select your cooking ability.'
      return null
    }
    case 17: {
      if (!data.breakfast.trim()) return 'Please describe your typical breakfast.'
      if (!data.lunch.trim()) return 'Please describe your typical lunch.'
      return null
    }
    case 18: {
      if (!data.dinner.trim()) return 'Please describe your typical dinner.'
      if (!data.snacks.trim()) return 'Please describe your snacks (or write "None").'
      return null
    }
    case 19: {
      const meals = mealTimingContext?.mealsForTiming ?? ['breakfast', 'lunch', 'dinner']
      const confirmed = new Set(mealTimingContext?.confirmedMeals ?? [])

      if (meals.length === 0) return 'Please select at least one meal to set a time for.'

      const timingFields: Record<string, keyof OnboardingFormData> = {
        breakfast: 'timing_breakfast',
        lunch: 'timing_lunch',
        dinner: 'timing_dinner',
        snacks: 'timing_snacks',
      }

      for (const meal of meals) {
        const field = timingFields[meal]
        const value = field ? String(data[field] ?? '') : ''
        if (!value) {
          const label = MEAL_TIMING_OPTIONS.find((o) => o.value === meal)?.label ?? meal
          return `Please set your ${label.toLowerCase()} time.`
        }
        if (!confirmed.has(meal)) {
          const label = MEAL_TIMING_OPTIONS.find((o) => o.value === meal)?.label ?? meal
          return `Please confirm your ${label.toLowerCase()} time.`
        }
      }
      return null
    }
    case 20: {
      if (!data.current_supplements.trim()) return 'Please list supplements or write "None".'
      return null
    }
    case 21: {
      const hasFront = photos?.front || savedPhotoUrls?.front
      const hasSide = photos?.side || savedPhotoUrls?.side
      const hasBack = photos?.back || savedPhotoUrls?.back
      if (!hasFront) return 'Front progress photo is required.'
      if (!hasSide) return 'Side progress photo is required.'
      if (!hasBack) return 'Back progress photo is required.'
      return null
    }
    case 22: {
      if (!data.terms_accepted) return 'You must accept the terms to complete onboarding.'
      return null
    }
    default:
      return null
  }
}

export function getSectionForStep(step: number): (typeof ONBOARDING_SECTIONS)[number] {
  if (step <= 1) return 'Basic'
  if (step <= 3) return 'Goals'
  if (step <= 6) return 'Lifestyle'
  if (step <= 10) return 'Training'
  if (step <= 12) return 'Medical'
  if (step <= 16) return 'Diet'
  if (step <= 19) return 'Eating'
  if (step === 20) return 'Supplements'
  if (step === 21) return 'Photos'
  return 'Review'
}

export type ReviewSection = {
  title: string
  items: { label: string; value: string }[]
}

export function buildReviewSections(
  form: OnboardingFormData,
  photoUrls: SavedPhotoUrls
): ReviewSection[] {
  const equipment =
    form.equipment_available.length > 0
      ? form.equipment_available
          .map((v) => EQUIPMENT_OPTIONS.find((o) => o.value === v)?.label ?? v.replace(/_/g, ' '))
          .join(', ')
      : 'Not specified'

  return [
    {
      title: 'Basic Information',
      items: [
        { label: 'Name', value: form.name },
        { label: 'Age', value: form.age },
        { label: 'Gender', value: getOnboardingLabel('gender', form.gender) },
        { label: 'Height', value: `${form.height} cm` },
        { label: 'Weight', value: `${form.weight} kg` },
      ],
    },
    {
      title: 'Goals',
      items: [
        { label: 'Primary goal', value: getOnboardingLabel('fitness_goal', form.fitness_goal) },
        { label: 'Deadline', value: getOnboardingLabel('goal_deadline', form.goal_deadline) },
        { label: 'Biggest struggle', value: formatStruggle(form.biggest_struggle) },
      ],
    },
    {
      title: 'Lifestyle',
      items: [
        { label: 'Occupation', value: getOnboardingLabel('occupation', form.occupation) },
        { label: 'Activity level', value: getOnboardingLabel('activity_level', form.activity_level) },
        { label: 'Daily steps', value: getOnboardingLabel('daily_steps', form.daily_steps) },
        { label: 'Sleep', value: getOnboardingLabel('sleep_duration', form.sleep_duration) },
        { label: 'Stress', value: getOnboardingLabel('stress_level', form.stress_level) },
        { label: 'Water intake', value: getOnboardingLabel('water_intake', form.water_intake) },
      ],
    },
    {
      title: 'Training',
      items: [
        { label: 'Location', value: getOnboardingLabel('training_location', form.training_location) },
        { label: 'Experience', value: getOnboardingLabel('training_experience', form.training_experience) },
        { label: 'Days per week', value: form.training_days_per_week || 'Not set' },
        { label: 'Duration', value: getOnboardingLabel('workout_duration', form.workout_duration) },
        { label: 'Preferred time', value: getOnboardingLabel('preferred_workout_time', form.preferred_workout_time) },
        { label: 'Equipment', value: equipment },
        { label: 'Favourite exercises', value: form.favorite_exercises || 'None specified' },
        { label: 'Exercises disliked', value: form.exercises_disliked || 'None specified' },
      ],
    },
    {
      title: 'Medical',
      items: [
        { label: 'Injuries', value: form.injuries || 'None' },
        { label: 'Medical conditions', value: form.medical_notes || 'None' },
        { label: 'Acne', value: ACNE_OPTIONS.find((o) => o.value === form.acne_status)?.label ?? 'Not set' },
        { label: 'Hair loss', value: HAIR_LOSS_OPTIONS.find((o) => o.value === form.hair_loss_status)?.label ?? 'Not set' },
        { label: 'Sexual health', value: SEXUAL_HEALTH_OPTIONS.find((o) => o.value === form.sexual_health_status)?.label ?? 'Not set' },
        { label: 'Pain during exercise', value: form.pain_during_exercise === 'none' ? 'No' : form.pain_during_exercise === 'yes' ? 'Yes' : 'Not set' },
        { label: 'Medications', value: form.medications || 'None' },
      ],
    },
    {
      title: 'Diet',
      items: [
        { label: 'Diet type', value: getOnboardingLabel('diet_preference', form.diet_preference) },
        { label: 'Egg days/week', value: form.egg_days || 'N/A' },
        { label: 'Chicken days/week', value: form.chicken_days || 'N/A' },
        { label: 'Fish days/week', value: form.fish_days || 'N/A' },
        { label: 'Whey protein', value: getOnboardingLabel('whey_protein', form.whey_protein) },
        { label: 'Allergies', value: form.food_allergies || 'None' },
        { label: 'Foods disliked', value: form.foods_disliked || 'None' },
        { label: 'Favourite foods', value: form.favorite_foods || 'None' },
        { label: 'Monthly budget', value: form.monthly_food_budget || 'Not set' },
        { label: 'Cooking ability', value: getOnboardingLabel('cooking_ability', form.cooking_ability) },
      ],
    },
    {
      title: 'Current Eating Pattern',
      items: [
        { label: 'Breakfast', value: form.breakfast },
        { label: 'Lunch', value: form.lunch },
        { label: 'Dinner', value: form.dinner },
        { label: 'Snacks', value: form.snacks },
        { label: 'Breakfast time', value: formatMealTime24(form.timing_breakfast) },
        { label: 'Lunch time', value: formatMealTime24(form.timing_lunch) },
        { label: 'Dinner time', value: formatMealTime24(form.timing_dinner) },
        { label: 'Snack time', value: formatMealTime24(form.timing_snacks) },
      ],
    },
    {
      title: 'Supplements',
      items: [{ label: 'Current supplements', value: form.current_supplements }],
    },
    {
      title: 'Progress Photos',
      items: [
        { label: 'Front', value: photoUrls.front ? 'Uploaded' : 'Missing' },
        { label: 'Side', value: photoUrls.side ? 'Uploaded' : 'Missing' },
        { label: 'Back', value: photoUrls.back ? 'Uploaded' : 'Missing' },
      ],
    },
  ]
}

export async function uploadOnboardingPhoto(
  supabase: SupabaseClient,
  clientId: string,
  file: File,
  label: 'front' | 'side' | 'back'
): Promise<string> {
  const { compressImageFile } = await import('@/lib/checkin')
  const compressed = typeof window !== 'undefined' ? await compressImageFile(file) : file
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${clientId}/${Date.now()}_${label}.${ext}`

  const { error } = await supabase.storage
    .from(ONBOARDING_PHOTO_BUCKET)
    .upload(path, compressed, { upsert: false, contentType: compressed.type || 'image/jpeg' })

  if (error) throw new Error(`Photo upload failed (${label}): ${error.message}`)

  // Store object path; display via signed URLs (bucket is private).
  return path
}

export async function saveOnboardingProgress(
  supabase: SupabaseClient,
  userId: string,
  form: OnboardingFormData,
  options: {
    email?: string | null
    step: number
    photoUrls?: SavedPhotoUrls
    complete?: boolean
  }
): Promise<void> {
  if (!options.complete) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', userId)
      .maybeSingle()

    if (existing?.onboarding_complete) {
      return
    }
  }

  const payload = buildProfilePayload(form, userId, {
    email: options.email,
    resumeStep: options.complete ? ONBOARDING_SCREEN_COUNT - 1 : options.step,
    complete: options.complete,
    photoUrls: options.photoUrls,
  })

  const { error } = options.complete
    ? await supabase.from('profiles').upsert(payload)
    : await supabase.from('profiles').update(payload).eq('id', userId)

  if (error) throw new Error(error.message)

  if (options.complete) {
    invalidateForEvent('onboarding_submitted', userId)
  }
}

export { ensureAuthSession, fetchClientProfile, isOnboardingComplete } from '@/lib/session-restore'

export function hasCompletedOnboarding(
  profile: Pick<OnboardingProfile, 'onboarding_complete' | 'onboarding_completed_at'> | null
): boolean {
  return isOnboardingComplete(profile)
}

export function isPaymentConfirmed(
  profile: Pick<OnboardingProfile, 'payment_confirmed' | 'access_source' | 'subscription_expires_at'> | null
): boolean {
  return hasClientEntitlement(profile)
}

/** Route paying clients to the correct next step after login. */
export function getClientPostAuthPath(
  profile: OnboardingProfile | null,
  profileError?: string
): string {
  if (profileError || !profile) {
    return '/dashboard'
  }

  if (!shouldBypassPaymentGuardClient() && !isPaymentConfirmed(profile)) {
    return '/checkout?plan=6_months'
  }

  if (isDefinitivelyOnboardingIncomplete(profile)) {
    return '/onboarding'
  }

  return '/dashboard'
}

type AuthResult = {
  user: { id: string; email?: string }
  profile: OnboardingProfile | null
  profileError?: string
}

export async function authenticateClient(
  supabase: SupabaseClient,
  router: AppRouterInstance,
  options?: {
    requireOnboarding?: boolean
    redirectIfOnboarded?: boolean
    requirePayment?: boolean
  }
): Promise<AuthResult | null> {
  const restored = await restoreSession(supabase)

  if (restored.status === 'unauthenticated') {
    redirectToLogin(router, 'client', 'session_expired')
    return null
  }

  if (restored.role === 'coach') {
    router.push(getRoleHomePath('coach'))
    return null
  }

  if (restored.role === 'admin') {
    router.push(getRoleHomePath('admin'))
    return null
  }

  if (restored.status === 'profile_unavailable') {
    return {
      user: restored.user,
      profile: null,
      profileError: restored.profileError,
    }
  }

  const { user, profile } = restored

  if (
    options?.requirePayment &&
    profile &&
    !isPaymentConfirmed(profile) &&
    !shouldBypassPaymentGuardClient()
  ) {
    router.push('/checkout?plan=6_months')
    return null
  }

  if (options?.redirectIfOnboarded && profile && isOnboardingComplete(profile)) {
    router.push('/dashboard')
    return null
  }

  if (options?.requireOnboarding && profile && isDefinitivelyOnboardingIncomplete(profile)) {
    router.push('/onboarding')
    return null
  }

  return { user, profile }
}

/**
 * Merges onboarding_data into profile fields the prompt builder reads,
 * without changing prompt-builder or generate-plan code.
 * Call when loading profile for display; generate-plan select('*') already
 * returns onboarding_data on the row for future prompt expansion.
 */
export function profileWithAiFields(profile: OnboardingProfile): OnboardingProfile {
  return {
    ...profile,
    medical_notes: buildMedicalNotesForProfile(formFromProfile(profile)),
    injuries: profile.injuries,
  }
}
