import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { OnboardingFormData, OnboardingProfile } from '@/types/database'

export const ONBOARDING_STEPS = [
  'Personal',
  'Goals',
  'Training',
  'Activity',
  'Nutrition',
  'Health',
  'Recovery',
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

export const DIET_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'non_vegetarian', label: 'Non Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
] as const

export const SLEEP_OPTIONS = [
  { value: 'less_than_6', label: 'Less than 6 hours' },
  { value: '6_to_7', label: '6–7 hours' },
  { value: '7_to_8', label: '7–8 hours' },
  { value: '8_plus', label: '8+ hours' },
] as const

export const ONBOARDING_LABELS: Record<string, Record<string, string>> = {
  gender: Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label])),
  fitness_goal: Object.fromEntries(FITNESS_GOAL_OPTIONS.map((o) => [o.value, o.label])),
  training_experience: Object.fromEntries(TRAINING_OPTIONS.map((o) => [o.value, o.label])),
  activity_level: Object.fromEntries(ACTIVITY_OPTIONS.map((o) => [o.value, o.label])),
  diet_preference: Object.fromEntries(DIET_OPTIONS.map((o) => [o.value, o.label])),
  sleep_duration: Object.fromEntries(SLEEP_OPTIONS.map((o) => [o.value, o.label])),
}

export function getOnboardingLabel(field: string, value: string | null | undefined): string {
  if (!value) return 'Not set'
  return ONBOARDING_LABELS[field]?.[value] ?? value.replace(/_/g, ' ')
}

export const INITIAL_ONBOARDING_FORM: OnboardingFormData = {
  age: '',
  gender: '',
  height: '',
  weight: '',
  fitness_goal: '',
  training_experience: '',
  activity_level: '',
  diet_preference: '',
  injuries: '',
  medical_notes: '',
  sleep_duration: '',
}

export function validateOnboardingStep(step: number, data: OnboardingFormData): string | null {
  switch (step) {
    case 0: {
      const age = Number(data.age)
      if (!data.age || Number.isNaN(age) || age < 13 || age > 100) return 'Enter a valid age (13–100).'
      if (!data.gender) return 'Please select your gender.'
      if (!data.height || Number(data.height) <= 0) return 'Enter a valid height in cm.'
      if (!data.weight || Number(data.weight) <= 0) return 'Enter a valid weight in kg.'
      return null
    }
    case 1:
      if (!data.fitness_goal) return 'Please select your primary goal.'
      return null
    case 2:
      if (!data.training_experience) return 'Please select your training experience.'
      return null
    case 3:
      if (!data.activity_level) return 'Please select your activity level.'
      return null
    case 4:
      if (!data.diet_preference) return 'Please select your diet preference.'
      return null
    case 5:
      return null
    case 6:
      if (!data.sleep_duration) return 'Please select your typical sleep duration.'
      return null
    default:
      return null
  }
}

export function isOnboardingComplete(profile: Pick<OnboardingProfile, 'onboarding_complete'> | null): boolean {
  return profile?.onboarding_complete === true
}

type AuthResult = {
  user: { id: string; email?: string }
  profile: OnboardingProfile | null
}

export async function authenticateClient(
  supabase: SupabaseClient,
  router: AppRouterInstance,
  options?: { requireOnboarding?: boolean; redirectIfOnboarded?: boolean }
): Promise<AuthResult | null> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    router.push('/login')
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (options?.redirectIfOnboarded && isOnboardingComplete(profile)) {
    router.push('/dashboard')
    return null
  }

  if (options?.requireOnboarding && !isOnboardingComplete(profile)) {
    router.push('/onboarding')
    return null
  }

  return { user, profile }
}
