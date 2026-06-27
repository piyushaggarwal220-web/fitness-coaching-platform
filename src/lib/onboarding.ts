import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { shouldBypassPaymentGuardClient } from '@/lib/dev-mode'
import type { OnboardingFormData, OnboardingProfile } from '@/types/database'

export const ONBOARDING_PHOTO_BUCKET = 'onboarding-photos'

export const ONBOARDING_STEPS = [
  'Personal',
  'Goals',
  'Training',
  'Lifestyle',
  'Diet',
  'Medical',
  'Photos',
  'Terms',
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
  name: '',
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
  terms_accepted: false,
}

export type OnboardingPhotoFiles = {
  front: File | null
  side: File | null
  back: File | null
}

export function validateOnboardingStep(
  step: number,
  data: OnboardingFormData,
  photos?: OnboardingPhotoFiles
): string | null {
  switch (step) {
    case 0: {
      if (!data.name.trim()) return 'Please enter your name.'
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
      if (!data.sleep_duration) return 'Please select your typical sleep duration.'
      return null
    case 4:
      if (!data.diet_preference) return 'Please select your diet preference.'
      return null
    case 5:
      return null
    case 6:
      if (!photos?.front) return 'Front progress photo is required.'
      if (!photos?.side) return 'Side progress photo is required.'
      if (!photos?.back) return 'Back progress photo is required.'
      return null
    case 7:
      if (!data.terms_accepted) return 'You must accept the terms to continue.'
      return null
    default:
      return null
  }
}

export async function uploadOnboardingPhoto(
  supabase: SupabaseClient,
  clientId: string,
  file: File,
  label: 'front' | 'side' | 'back'
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${clientId}/${Date.now()}_${label}.${ext}`

  const { error } = await supabase.storage
    .from(ONBOARDING_PHOTO_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })

  if (error) throw new Error(`Photo upload failed (${label}): ${error.message}`)

  const { data } = supabase.storage.from(ONBOARDING_PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export function isOnboardingComplete(profile: Pick<OnboardingProfile, 'onboarding_complete'> | null): boolean {
  return profile?.onboarding_complete === true
}

export function isPaymentConfirmed(profile: Pick<OnboardingProfile, 'payment_confirmed'> | null): boolean {
  return profile?.payment_confirmed === true
}

/** Route paying clients to the correct next step after login. */
export function getClientPostAuthPath(profile: OnboardingProfile | null): string {
  if (!shouldBypassPaymentGuardClient() && !isPaymentConfirmed(profile)) {
    return '/checkout?plan=6_months'
  }
  if (!isOnboardingComplete(profile)) {
    return '/onboarding'
  }
  return '/dashboard'
}

type AuthResult = {
  user: { id: string; email?: string }
  profile: OnboardingProfile | null
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

  if (
    options?.requirePayment &&
    !isPaymentConfirmed(profile) &&
    !shouldBypassPaymentGuardClient()
  ) {
    router.push('/checkout?plan=6_months')
    return null
  }

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
