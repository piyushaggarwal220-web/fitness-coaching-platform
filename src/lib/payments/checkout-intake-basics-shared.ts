import { getPurchasablePlan } from '@/lib/payments/plans'
import type { GoalBodyType } from '@/lib/plan-goals'

export const CHECKOUT_MAIN_GOAL_OPTIONS = [
  { value: 'lose_fat', label: 'Lose fat' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'both', label: 'Lose fat + build muscle' },
  { value: 'athletic', label: 'Athletic body' },
] as const

export type CheckoutMainGoal = (typeof CHECKOUT_MAIN_GOAL_OPTIONS)[number]['value']

export const CHECKOUT_BASICS_DIET_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'eggetarian', label: 'Eggetarian' },
  { value: 'non_vegetarian', label: 'Non-veg' },
  { value: 'vegan', label: 'Vegan' },
] as const

export const CHECKOUT_BASICS_GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const

export type CheckoutBasicsInput = {
  verificationId: string
  email: string
  phone: string
  name?: string
  planSlug: string
  age: number | string
  gender: string
  heightCm: number | string
  weightKg?: number | string | null
  dietPreference: string
  mainGoal: string
}

function isMainGoal(value: string): value is CheckoutMainGoal {
  return CHECKOUT_MAIN_GOAL_OPTIONS.some((option) => option.value === value)
}

function isDiet(value: string): boolean {
  return CHECKOUT_BASICS_DIET_OPTIONS.some((option) => option.value === value)
}

function isGender(value: string): boolean {
  return CHECKOUT_BASICS_GENDER_OPTIONS.some((option) => option.value === value)
}

export function normalizeCheckoutBasicsEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateCheckoutBasicsPayload(input: CheckoutBasicsInput): {
  ok: true
  value: {
    verificationId: string
    email: string
    phone: string
    name: string | null
    planSlug: string
    age: number
    gender: string
    heightCm: number
    weightKg: number | null
    dietPreference: string
    mainGoal: CheckoutMainGoal
  }
} | { ok: false; error: string; missing: string[] } {
  const missing: string[] = []
  const email = normalizeCheckoutBasicsEmail(input.email ?? '')
  const phone = String(input.phone ?? '').trim()
  const plan = getPurchasablePlan(input.planSlug)
  const age = typeof input.age === 'number' ? input.age : Number(String(input.age).trim())
  const heightCm =
    typeof input.heightCm === 'number' ? input.heightCm : Number(String(input.heightCm).trim())
  const weightRaw =
    input.weightKg === null || input.weightKg === undefined || input.weightKg === ''
      ? null
      : typeof input.weightKg === 'number'
        ? input.weightKg
        : Number(String(input.weightKg).trim())

  if (!input.verificationId?.trim()) missing.push('Email verification')
  if (!email.includes('@')) missing.push('A valid email')
  if (!phone) missing.push('A valid WhatsApp number')
  if (!plan) missing.push('A valid plan')
  if (!Number.isFinite(age) || age < 13 || age > 100) missing.push('Age (13–100)')
  if (!isGender(String(input.gender ?? '').trim())) missing.push('Gender')
  if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 230) {
    missing.push('Height in cm (120–230)')
  }
  if (weightRaw != null && (!Number.isFinite(weightRaw) || weightRaw < 30 || weightRaw > 250)) {
    missing.push('Weight in kg (30–250)')
  }
  if (!isDiet(String(input.dietPreference ?? '').trim())) missing.push('Diet type')
  if (!isMainGoal(String(input.mainGoal ?? '').trim())) missing.push('Main goal')

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Complete these basics first: ${missing.join('; ')}`,
      missing,
    }
  }

  return {
    ok: true,
    value: {
      verificationId: input.verificationId.trim(),
      email,
      phone,
      name: input.name?.trim() || null,
      planSlug: plan!.slug,
      age: Math.round(age),
      gender: String(input.gender).trim(),
      heightCm: Math.round(heightCm * 10) / 10,
      weightKg: weightRaw == null ? null : Math.round(weightRaw * 10) / 10,
      dietPreference: String(input.dietPreference).trim(),
      mainGoal: String(input.mainGoal).trim() as CheckoutMainGoal,
    },
  }
}

export function mainGoalToProfileSeed(mainGoal: CheckoutMainGoal): {
  fitnessGoal: string
  startingBodyType: GoalBodyType
} {
  switch (mainGoal) {
    case 'build_muscle':
      return { fitnessGoal: 'muscle_gain', startingBodyType: 'weight_gain' }
    case 'both':
      return { fitnessGoal: 'lose_fat_build_muscle', startingBodyType: 'skinny_fat' }
    case 'athletic':
      return { fitnessGoal: 'look_athletic', startingBodyType: 'skinny_fat' }
    case 'lose_fat':
    default:
      return { fitnessGoal: 'fat_loss', startingBodyType: 'lose_fat_fast' }
  }
}
