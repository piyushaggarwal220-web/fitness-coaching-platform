import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { shouldBypassPayment } from '@/lib/config'
import {
  assertCheckoutContactsVerified,
  normalizeCheckoutEmail,
  normalizeCheckoutPhone,
} from '@/lib/payments/checkout-otp'
import {
  mainGoalToProfileSeed,
  normalizeCheckoutBasicsEmail,
  validateCheckoutBasicsPayload,
  type CheckoutBasicsInput,
  type CheckoutMainGoal,
} from '@/lib/payments/checkout-intake-basics-shared'

export {
  CHECKOUT_BASICS_DIET_OPTIONS,
  CHECKOUT_BASICS_GENDER_OPTIONS,
  CHECKOUT_MAIN_GOAL_OPTIONS,
  mainGoalToProfileSeed,
  validateCheckoutBasicsPayload,
  type CheckoutBasicsInput,
  type CheckoutMainGoal,
} from '@/lib/payments/checkout-intake-basics-shared'

export type CheckoutIntakeBasicsRow = {
  id: string
  verification_id: string
  email: string
  plan_slug: string
  age: number
  gender: string
  height_cm: number
  weight_kg: number | null
  diet_preference: string
  main_goal: CheckoutMainGoal
  customer_name: string | null
  phone_e164: string | null
  consumed_at: string | null
  consumed_by_user_id: string | null
  nurture_day1_sent_at: string | null
  nurture_day2_sent_at: string | null
  created_at: string
  updated_at: string
}

export async function upsertCheckoutIntakeBasics(
  input: CheckoutBasicsInput
): Promise<
  | { ok: true; basics: CheckoutIntakeBasicsRow }
  | { ok: false; error: string; status: number; missing?: string[] }
> {
  const validated = validateCheckoutBasicsPayload(input)
  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400, missing: validated.missing }
  }

  const phone = normalizeCheckoutPhone(validated.value.phone)
  if (!phone) {
    return { ok: false, error: 'A valid WhatsApp number is required', status: 400 }
  }

  const contactCheck = await assertCheckoutContactsVerified({
    verificationId: validated.value.verificationId,
    email: validated.value.email,
    phone,
  })
  if (!contactCheck.ok) {
    return { ok: false, error: contactCheck.error, status: contactCheck.status }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('checkout_intake_basics')
    .upsert(
      {
        verification_id: validated.value.verificationId,
        email: validated.value.email,
        plan_slug: validated.value.planSlug,
        age: validated.value.age,
        gender: validated.value.gender,
        height_cm: validated.value.heightCm,
        weight_kg: validated.value.weightKg,
        diet_preference: validated.value.dietPreference,
        main_goal: validated.value.mainGoal,
        customer_name: validated.value.name,
        phone_e164: phone,
        updated_at: now,
      },
      { onConflict: 'verification_id' }
    )
    .select('*')
    .single()

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'Could not save intake basics',
      status: 500,
    }
  }

  return { ok: true, basics: data as CheckoutIntakeBasicsRow }
}

export async function getCheckoutIntakeBasicsByVerification(
  verificationId: string
): Promise<CheckoutIntakeBasicsRow | null> {
  const id = verificationId.trim()
  if (!id) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('checkout_intake_basics')
    .select('*')
    .eq('verification_id', id)
    .maybeSingle()
  return (data as CheckoutIntakeBasicsRow | null) ?? null
}

export async function assertCheckoutIntakeBasicsComplete(input: {
  verificationId: string | undefined
  email: string
  phone: string
}): Promise<{ ok: true; basics: CheckoutIntakeBasicsRow | null } | { ok: false; error: string; status: number }> {
  if (shouldBypassPayment()) {
    return { ok: true, basics: null }
  }

  const contactCheck = await assertCheckoutContactsVerified(input)
  if (!contactCheck.ok) {
    return { ok: false, error: contactCheck.error, status: contactCheck.status }
  }

  const basics = await getCheckoutIntakeBasicsByVerification(input.verificationId!.trim())
  if (!basics || basics.consumed_at) {
    return {
      ok: false,
      error: 'Answer the quick intake basics before paying',
      status: 400,
    }
  }

  const email = normalizeCheckoutEmail(input.email)
  if (basics.email !== email) {
    return { ok: false, error: 'Intake basics do not match this email', status: 400 }
  }

  return { ok: true, basics }
}

export function profilePayloadFromCheckoutBasics(basics: CheckoutIntakeBasicsRow): {
  columns: Record<string, unknown>
  onboardingDataPatch: {
    goals: {
      startingBodyType: string
      selectedGoals: null
      goalDetails: null
      coachTone: null
    }
  }
} {
  const seed = mainGoalToProfileSeed(basics.main_goal)
  return {
    columns: {
      age: basics.age,
      gender: basics.gender,
      height: basics.height_cm,
      ...(basics.weight_kg != null ? { weight: basics.weight_kg } : {}),
      diet_preference: basics.diet_preference,
      fitness_goal: seed.fitnessGoal,
    },
    onboardingDataPatch: {
      goals: {
        startingBodyType: seed.startingBodyType,
        selectedGoals: null,
        goalDetails: null,
        coachTone: null,
      },
    },
  }
}

/** Merge pre-pay basics into profile once at claim. Idempotent if already consumed. */
export async function consumeCheckoutIntakeBasicsForUser(input: {
  email: string
  userId: string
  verificationId?: string | null
}): Promise<CheckoutIntakeBasicsRow | null> {
  const admin = createAdminClient()
  const email = normalizeCheckoutBasicsEmail(input.email)
  let basics: CheckoutIntakeBasicsRow | null = null

  if (input.verificationId?.trim()) {
    basics = await getCheckoutIntakeBasicsByVerification(input.verificationId)
  }

  if (!basics || basics.email !== email) {
    const { data } = await admin
      .from('checkout_intake_basics')
      .select('*')
      .eq('email', email)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    basics = (data as CheckoutIntakeBasicsRow | null) ?? null
  }

  if (!basics || basics.consumed_at) return basics

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('age, gender, height, weight, diet_preference, fitness_goal, onboarding_data')
    .eq('id', input.userId)
    .maybeSingle()

  const seed = profilePayloadFromCheckoutBasics(basics)
  const profileUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  const existing = existingProfile as Record<string, unknown> | null
  for (const [key, value] of Object.entries(seed.columns)) {
    const current = existing?.[key]
    if (current == null || current === '') {
      profileUpdate[key] = value
    }
  }

  const existingData =
    existing?.onboarding_data && typeof existing.onboarding_data === 'object'
      ? (existing.onboarding_data as Record<string, unknown>)
      : {}
  const existingGoals =
    existingData.goals && typeof existingData.goals === 'object'
      ? (existingData.goals as Record<string, unknown>)
      : {}
  if (!existingGoals.startingBodyType) {
    profileUpdate.onboarding_data = {
      ...existingData,
      goals: {
        ...existingGoals,
        ...seed.onboardingDataPatch.goals,
      },
    }
  }

  if (Object.keys(profileUpdate).length > 1) {
    await admin.from('profiles').update(profileUpdate).eq('id', input.userId)
  }

  const now = new Date().toISOString()
  await admin
    .from('checkout_intake_basics')
    .update({
      consumed_at: now,
      consumed_by_user_id: input.userId,
      updated_at: now,
    })
    .eq('id', basics.id)
    .is('consumed_at', null)

  return { ...basics, consumed_at: now, consumed_by_user_id: input.userId }
}
