import { randomBytes } from 'node:crypto'
import { assignCoachToClient } from '@/lib/admin/assign-coach'
import {
  applyCompletedOnboarding,
  generateFakeClientEmail,
  generateFakeOnboardingForm,
} from '@/lib/admin/fake-client-generator'
import { getPortalLoginUrl } from '@/lib/admin/portal-urls'
import { assertTrialClient } from '@/lib/admin/trial-client-guard'
import { repairClientWorkflowConsistency } from '@/lib/admin/workflow-consistency'
import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import {
  PUBLIC_DEMO_CLIENT_EMAIL,
  PUBLIC_DEMO_CLIENT_NAME,
} from '@/lib/public-demo'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AccessSource } from '@/lib/entitlements'
import type { OnboardingFormData } from '@/types/database'

export { listTrialClients } from '@/lib/admin/trial-client-guard'
export { resetTrialClient } from '@/lib/admin/trial-client-reset'
export type { ResetTrialClientResult } from '@/lib/admin/trial-client-reset'
export type { TrialClientSummary } from '@/lib/admin/trial-client-guard'

export const DEMO_ADMIN_EMAIL = 'admin@test.local'
export const DEMO_COACH_EMAIL = 'coach@test.local'
export const DEMO_CLIENT_EMAIL = 'client@test.local'

export type CreatedAccountCredentials = {
  userId: string
  email: string
  password: string
  role: string
  loginUrl: string
  created: boolean
  message: string
  coachId?: string
  clientId?: string
}

export function generateSecurePassword(length = 16): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&'
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient()
  const normalized = email.trim().toLowerCase()

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()

  if (profile?.id) return profile.id

  const { data: listed, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)

  const match = listed.users.find((user) => user.email?.toLowerCase() === normalized)
  return match?.id ?? null
}

async function upsertProfile(input: {
  userId: string
  email: string
  name: string
  role?: 'client' | 'coach' | 'admin' | 'super_admin'
  paymentConfirmed?: boolean
  accessSource?: AccessSource | null
  fitnessGoal?: string | null
  coachId?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const includeAccessSource = await hasAccessSourceColumn()

  const payload: Record<string, unknown> = {
    id: input.userId,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role ?? 'client',
    payment_confirmed: input.paymentConfirmed ?? false,
    onboarding_complete: false,
    fitness_goal: input.fitnessGoal?.trim() || null,
    coach_id: input.coachId ?? null,
    updated_at: now,
  }

  if (includeAccessSource && input.accessSource) {
    payload.access_source = input.accessSource
  }

  const { error } = await admin.from('profiles').upsert(payload)
  if (error) throw new Error(`Failed to upsert profile: ${error.message}`)
}

export type CreateTrialClientInput = {
  name: string
  email: string
  password: string
  fitnessGoal?: string | null
  coachId?: string | null
}

/** Create a trial client with full platform access (no Razorpay). */
export async function createTrialClient(input: CreateTrialClientInput): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const password = input.password.trim()
  const name = input.name.trim()

  if (!email || !password || !name) {
    throw new Error('Name, email, and password are required.')
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    throw new Error('An account with this email already exists.')
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'client' },
  })

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? 'Failed to create auth user')
  }

  await upsertProfile({
    userId: authData.user.id,
    email,
    name,
    role: 'client',
    paymentConfirmed: true,
    accessSource: 'admin_trial',
    fitnessGoal: input.fitnessGoal,
    coachId: input.coachId ?? null,
  })

  if (input.coachId) {
    const { error: assignError } = await assignCoachToClient(admin, authData.user.id, input.coachId)
    if (assignError) throw new Error(assignError)
  }

  return {
    userId: authData.user.id,
    clientId: authData.user.id,
    email,
    password,
    role: 'client',
    loginUrl: getPortalLoginUrl('client'),
    created: true,
    message: 'Trial client created with full platform access.',
  }
}

export type CreateTrialCoachInput = {
  name: string
  email: string
  password: string
}

/** Create a trial coach with immediate coach portal access. */
export async function createTrialCoach(input: CreateTrialCoachInput): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const password = input.password.trim()
  const name = input.name.trim()

  if (!email || !password || !name) {
    throw new Error('Name, email, and password are required.')
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id')
      .eq('user_id', existingId)
      .maybeSingle()

    if (coachRow?.id) {
      throw new Error('An account with this email already exists.')
    }
  }

  let userId = existingId

  if (!userId) {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'coach' },
    })

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? 'Failed to create auth user')
    }

    userId = authData.user.id
  }

  const { data: coachRow, error: coachError } = await admin
    .from('coaches')
    .insert({
      user_id: userId,
      name,
      hard_cap: 100,
    })
    .select('id')
    .single()

  if (coachError || !coachRow) {
    throw new Error(coachError?.message ?? 'Failed to create coach record')
  }

  await upsertProfile({
    userId,
    email,
    name,
    role: 'coach',
    paymentConfirmed: false,
    accessSource: null,
  })

  return {
    userId,
    coachId: coachRow.id,
    email,
    password,
    role: 'coach',
    loginUrl: getPortalLoginUrl('coach'),
    created: true,
    message: 'Trial coach created.',
  }
}

async function ensureAuthUser(input: {
  email: string
  password: string
  name: string
  metadataRole: string
}): Promise<{ userId: string; created: boolean }> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    return { userId: existingId, created: false }
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name, role: input.metadataRole },
  })

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? 'Failed to create auth user')
  }

  return { userId: authData.user.id, created: true }
}

/** Ensure default super_admin demo account exists. */
export async function ensureDemoAdminAccount(password?: string): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = DEMO_ADMIN_EMAIL
  const resolvedPassword = password ?? generateSecurePassword()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', existingId)
      .maybeSingle()

    if (profile?.role !== 'super_admin') {
      await admin.from('profiles').update({ role: 'super_admin', updated_at: new Date().toISOString() }).eq('id', existingId)
    }

    return {
      userId: existingId,
      email,
      password: resolvedPassword,
      role: 'super_admin',
      loginUrl: getPortalLoginUrl('admin'),
      created: false,
      message: 'Admin account already exists.',
    }
  }

  const { userId, created } = await ensureAuthUser({
    email,
    password: resolvedPassword,
    name: 'Demo Admin',
    metadataRole: 'super_admin',
  })

  await upsertProfile({
    userId,
    email,
    name: 'Demo Admin',
    role: 'super_admin',
    paymentConfirmed: false,
    accessSource: null,
  })

  return {
    userId,
    email,
    password: resolvedPassword,
    role: 'super_admin',
    loginUrl: getPortalLoginUrl('admin'),
    created,
    message: created ? 'Demo admin account created.' : 'Admin account already exists.',
  }
}

/** Ensure default trial coach demo account exists. */
export async function ensureDemoCoachAccount(password?: string): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = DEMO_COACH_EMAIL
  const resolvedPassword = password ?? generateSecurePassword()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id')
      .eq('user_id', existingId)
      .maybeSingle()

    if (coachRow?.id) {
      return {
        userId: existingId,
        coachId: coachRow.id,
        email,
        password: resolvedPassword,
        role: 'coach',
        loginUrl: getPortalLoginUrl('coach'),
        created: false,
        message: 'Trial coach account already exists.',
      }
    }

    const { data: inserted, error: coachError } = await admin
      .from('coaches')
      .insert({ user_id: existingId, name: 'Demo Coach', hard_cap: 100 })
      .select('id')
      .single()

    if (coachError || !inserted) {
      throw new Error(coachError?.message ?? 'Failed to create coach record for existing user')
    }

    await upsertProfile({
      userId: existingId,
      email,
      name: 'Demo Coach',
      role: 'coach',
      paymentConfirmed: false,
      accessSource: null,
    })

    return {
      userId: existingId,
      coachId: inserted.id,
      email,
      password: resolvedPassword,
      role: 'coach',
      loginUrl: getPortalLoginUrl('coach'),
      created: true,
      message: 'Demo coach account created.',
    }
  }

  const result = await createTrialCoach({
    name: 'Demo Coach',
    email,
    password: resolvedPassword,
  })

  return {
    ...result,
    created: true,
    message: 'Demo coach account created.',
  }
}

/** Ensure default trial client demo account exists. */
export async function ensureDemoClientAccount(
  password?: string,
  coachId?: string | null
): Promise<CreatedAccountCredentials> {
  const email = DEMO_CLIENT_EMAIL
  const resolvedPassword = password ?? generateSecurePassword()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const admin = createAdminClient()
    const includeAccessSource = await hasAccessSourceColumn()
    const fixPayload: Record<string, unknown> = {
      payment_confirmed: true,
      role: 'client',
      updated_at: new Date().toISOString(),
    }
    if (includeAccessSource) fixPayload.access_source = 'admin_trial'
    if (coachId) fixPayload.coach_id = coachId
    await admin.from('profiles').update(fixPayload).eq('id', existingId)

    if (coachId) {
      const { error: assignError } = await assignCoachToClient(admin, existingId, coachId)
      if (assignError) throw new Error(assignError)
    }

    await repairClientWorkflowConsistency(existingId)

    const { data: afterRepair } = await admin
      .from('profiles')
      .select('onboarding_complete, plan_delivered')
      .eq('id', existingId)
      .maybeSingle()

    const { count: activePlanCount } = await admin
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', existingId)
      .eq('active', true)

    if ((activePlanCount ?? 0) > 0 && !afterRepair?.onboarding_complete) {
      await applyCompletedOnboarding(existingId, email, generateFakeOnboardingForm())
    }

    return {
      userId: existingId,
      clientId: existingId,
      email,
      password: resolvedPassword,
      role: 'client',
      loginUrl: getPortalLoginUrl('client'),
      created: false,
      message: 'Trial client account already exists.',
    }
  }

  const result = await createTrialClient({
    name: 'Demo Client',
    email,
    password: resolvedPassword,
    fitnessGoal: 'fat_loss',
    coachId: coachId ?? null,
  })

  return {
    ...result,
    created: true,
    message: 'Demo client account created.',
  }
}

const PUBLIC_DEMO_WORKOUT = `WEEK 1 — GYM (view-only demo)

Day 1 — Push
- Barbell bench press 4x8
- Incline dumbbell press 3x10
- Overhead press 3x8
- Cable fly 3x12
- Tricep pushdown 3x12

Day 2 — Pull
- Lat pulldown 4x10
- Seated row 3x10
- Face pull 3x15
- EZ bar curl 3x10

Day 3 — Legs
- Back squat 4x8
- Romanian deadlift 3x10
- Walking lunge 3x10/side
- Calf raise 3x15

Rest 90 seconds between sets. Log what you complete in the tracker.`

/** Weekday meals (Mon, Wed, Fri): poha + eggs, chicken lunch. Primary options only in Daily Total. */
const PUBLIC_DEMO_DIET_WEEKDAY_A = `Breakfast (8:30 am)
Have 2 cups cooked poha (approx 200g) with 1 tbsp roasted peanuts (approx 15g), 1 small onion, a pinch of turmeric, and 1 tsp oil. Side: 3 whole eggs (approx 150g), boiled or scrambled with a pinch of salt.
(P: 30g | C: 52g | F: 21g | ~520 kcal)
Or swap the poha for 3 idlis (approx 180g) with 1 katori sambar (approx 150g cooked) and keep the eggs.
(P: 28g | C: 55g | F: 16g | ~480 kcal)

Lunch (1:30 pm)
Have 180g cooked chicken (approx 180g), 2 rotis (approx 80g), 1 katori cooked dal (approx 150g), and 1 small bowl salad (approx 100g cucumber and tomato). Mix 1 tsp ghee into the dal. Squeeze lemon on the salad.
(P: 65g | C: 58g | F: 17g | ~650 kcal)
Or swap the rotis for 1 katori cooked rice (approx 180g) if you want rice at lunch.
(P: 64g | C: 62g | F: 16g | ~650 kcal)

Evening snack (6:00 pm)
Have 200g Greek yogurt with 1 medium banana (approx 100g) and 10g almonds. A pinch of cinnamon is nice if you have it.
(P: 22g | C: 30g | F: 10g | ~300 kcal)

Dinner (8:30 pm)
Have 1.5 katori cooked rice (approx 225g), 1 katori dal tadka (approx 150g cooked), 1 katori mixed sabzi (approx 150g), and 100g paneer. Use 1 tsp oil for the sabzi. Keep spices simple: jeera, haldi, salt.
(P: 43g | C: 85g | F: 24g | ~730 kcal)

Cooking fat today: 2 tsp oil and 1 tsp ghee.
Daily Total: ~2200 kcal | P: 160g | C: 225g | F: 72g`

/** Tue / Thu: idli breakfast, same chicken lunch pattern, different fruit at snack. */
const PUBLIC_DEMO_DIET_WEEKDAY_B = `Breakfast (8:30 am)
Have 3 idlis (approx 180g) with 1 katori coconut chutney (approx 80g) and 1 katori sambar (approx 150g cooked). Side: 2 whole eggs (approx 100g) and 1 glass milk (200ml).
(P: 30g | C: 54g | F: 20g | ~520 kcal)
Or swap the idlis for 2 cups cooked poha (approx 200g) with 1 tbsp roasted peanuts (approx 15g) and 1 tsp oil, and keep the eggs.
(P: 30g | C: 52g | F: 21g | ~520 kcal)

Lunch (1:30 pm)
Have 180g cooked chicken (approx 180g), 2 rotis (approx 80g), 1 katori cooked dal (approx 150g), and 1 small bowl salad (approx 100g). Mix 1 tsp ghee into the dal.
(P: 65g | C: 58g | F: 17g | ~650 kcal)
Or swap chicken for 150g paneer bhurji cooked in 1 tsp oil, with the same rotis, dal, and salad.
(P: 48g | C: 58g | F: 24g | ~640 kcal)

Evening snack (6:00 pm)
Have 200g Greek yogurt with 1 medium apple (approx 150g) and 10g roasted peanuts.
(P: 22g | C: 32g | F: 10g | ~310 kcal)

Dinner (8:30 pm)
Have 2 rotis (approx 80g), 1 katori cooked rice (approx 180g), 1 katori dal tadka (approx 150g cooked), 1 katori sabzi (approx 150g), and 80g paneer. Use 1 tsp oil for cooking.
(P: 43g | C: 80g | F: 24g | ~710 kcal)

Cooking fat today: 2 tsp oil and 1 tsp ghee.
Daily Total: ~2190 kcal | P: 160g | C: 224g | F: 71g`

/** Weekend: besan chilla + rajma rice, paneer at dinner. Written in full for the tracker. */
const PUBLIC_DEMO_DIET_WEEKEND = `Breakfast (9:00 am)
Have 2 besan chillas (approx 160g cooked) with 1 tsp oil, 2 whole eggs (approx 100g), and 150g curd on the side. Green chutney is fine if it is not oily.
(P: 36g | C: 28g | F: 22g | ~450 kcal)
Or swap the chillas for 2 cups cooked poha (approx 200g) with 1 tbsp peanuts (approx 15g) and keep the eggs and curd.
(P: 32g | C: 50g | F: 20g | ~510 kcal)

Lunch (1:30 pm)
Have 1.5 katori cooked rice (approx 225g), 1.5 katori cooked rajma (approx 250g), 80g paneer, and 1 small bowl salad (approx 100g). Use 1 tsp oil in the rajma. A squeeze of lemon on top helps.
(P: 42g | C: 90g | F: 20g | ~710 kcal)
Or swap rice for 3 rotis (approx 120g) with the same rajma, paneer, and salad.
(P: 44g | C: 70g | F: 20g | ~640 kcal)

Evening snack (6:00 pm)
Have 200g Greek yogurt with 1 medium banana (approx 100g) and 15g roasted peanuts.
(P: 24g | C: 32g | F: 14g | ~350 kcal)

Dinner (8:30 pm)
Have 2 rotis (approx 80g), 1 katori dal tadka (approx 150g cooked), 1 katori mixed sabzi (approx 150g), and 120g paneer. Mix 1 tsp ghee into the dal. If you are very full, keep paneer at 80g (approx 80g) and skip the second roti.
(P: 48g | C: 55g | F: 26g | ~650 kcal)

Cooking fat today: 2 tsp oil and 1 tsp ghee.
Daily Total: ~2160 kcal | P: 150g | C: 205g | F: 82g`

export const PUBLIC_DEMO_NUTRITION = `Calories: 2190
Protein: 157g
Carbs: 220g
Fat: 74g

Daily averages: ~2190 kcal | P: 157g | C: 220g | F: 74g

Here is this week's diet. Simple home meals with household portions and approx grams so you can cook without guessing. No whey this week. Protein comes from eggs, chicken, dal, curd, and paneer.

Day 1 (Monday)
${PUBLIC_DEMO_DIET_WEEKDAY_A}

Day 2 (Tuesday)
${PUBLIC_DEMO_DIET_WEEKDAY_B}

Day 3 (Wednesday)
${PUBLIC_DEMO_DIET_WEEKDAY_A}

Day 4 (Thursday)
${PUBLIC_DEMO_DIET_WEEKDAY_B}

Day 5 (Friday)
${PUBLIC_DEMO_DIET_WEEKDAY_A}

Day 6 (Saturday)
${PUBLIC_DEMO_DIET_WEEKEND}

Day 7 (Sunday)
${PUBLIC_DEMO_DIET_WEEKEND}

Aim for 3 to 4 litres of water daily. Cook dal and sabzi as the final cooked katori on the plate, not raw weights.

With gym days and 8 to 10k steps, a steady fat loss pace is about 0.3 to 0.5 kg per week when most meals are hit. If training is lighter, keep food as written and push walking first rather than cutting the plate. You've got this. Have a strong week.`

/** Public homepage demo client — view-only, hidden from coach rosters. */
export async function ensurePublicDemoClient(password?: string): Promise<CreatedAccountCredentials> {
  const email = PUBLIC_DEMO_CLIENT_EMAIL
  const resolvedPassword = password?.trim() || generateSecurePassword()
  const existingId = await findUserIdByEmail(email)

  let userId = existingId
  let created = false

  if (!existingId) {
    const createdAccount = await createTrialClient({
      name: PUBLIC_DEMO_CLIENT_NAME,
      email,
      password: resolvedPassword,
      fitnessGoal: 'fat_loss',
      coachId: null,
    })
    userId = createdAccount.userId
    created = true
  } else {
    const admin = createAdminClient()
    await admin.auth.admin.updateUserById(existingId, {
      password: resolvedPassword,
      email_confirm: true,
    })
    const includeAccessSource = await hasAccessSourceColumn()
    const fixPayload: Record<string, unknown> = {
      payment_confirmed: true,
      role: 'client',
      name: PUBLIC_DEMO_CLIENT_NAME,
      coach_id: null,
      updated_at: new Date().toISOString(),
    }
    if (includeAccessSource) fixPayload.access_source = 'admin_trial'
    await admin.from('profiles').update(fixPayload).eq('id', existingId)
  }

  if (!userId) throw new Error('Public demo client could not be created.')

  await applyCompletedOnboarding(userId, email, generateFakeOnboardingForm(PUBLIC_DEMO_CLIENT_NAME))

  const admin = createAdminClient()
  const { count: activePlanCount } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', userId)
    .eq('active', true)

  const now = new Date().toISOString()
  const demoPlanFields = {
    title: 'Week 1 fat loss',
    phase: 'Foundation',
    workout_plan: PUBLIC_DEMO_WORKOUT,
    nutrition_plan: PUBLIC_DEMO_NUTRITION,
    cardio_plan: 'Walk 8–10k steps daily. Optional 20 min incline walk after lifting.',
    supplement_plan: 'Vitamin D if deficient. Food first for protein, no whey this week.',
    coach_notes: 'Keep meals simple this week. Hit protein at lunch and dinner, and walk 8 to 10k steps most days.',
  }

  if ((activePlanCount ?? 0) === 0) {
    const { data: anyCoach } = await admin.from('coaches').select('id').limit(1).maybeSingle()
    if (!anyCoach?.id) {
      throw new Error('Need a coach row to attach the view-only demo plan.')
    }
    await admin
      .from('profiles')
      .update({ coach_id: anyCoach.id, updated_at: now })
      .eq('id', userId)
    const { error: planError } = await admin.from('plans').insert({
      client_id: userId,
      coach_id: anyCoach.id,
      ...demoPlanFields,
      version: 1,
      active: true,
      delivered_at: now,
    })
    if (planError) throw new Error(`Failed to seed demo plan: ${planError.message}`)
    await admin
      .from('profiles')
      .update({
        plan_delivered: true,
        checkin_schedule_started_at: now,
        updated_at: now,
      })
      .eq('id', userId)
  } else {
    const { error: planUpdateError } = await admin
      .from('plans')
      .update({
        ...demoPlanFields,
        updated_at: now,
      })
      .eq('client_id', userId)
      .eq('active', true)
    if (planUpdateError) throw new Error(`Failed to refresh demo plan: ${planUpdateError.message}`)
  }

  return {
    userId,
    clientId: userId,
    email,
    password: resolvedPassword,
    role: 'client',
    loginUrl: '/try',
    created,
    message: created
      ? 'Public demo client created with a sample plan.'
      : 'Public demo client updated. Password refreshed.',
  }
}

export async function ensureAllDemoAccounts(): Promise<CreatedAccountCredentials[]> {
  const admin = await ensureDemoAdminAccount()
  const coach = await ensureDemoCoachAccount()
  const client = await ensureDemoClientAccount(undefined, coach.coachId ?? null)
  return [admin, coach, client]
}

export async function listCoachesForAssignment(): Promise<
  Array<{ id: string; name: string | null; user_id: string }>
> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('coaches')
    .select('id, name, user_id')
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Create a fake trial client with realistic onboarding data already completed. */
export async function createFakeTrialClient(
  coachId?: string | null,
  formOverride?: Partial<OnboardingFormData>
): Promise<CreatedAccountCredentials> {
  const form = generateFakeOnboardingForm(formOverride?.name)
  if (formOverride) Object.assign(form, formOverride)
  const email = generateFakeClientEmail()
  const password = generateSecurePassword()

  const account = await createTrialClient({
    name: form.name,
    email,
    password,
    fitnessGoal: form.fitness_goal,
    coachId: coachId ?? null,
  })

  await applyCompletedOnboarding(account.userId, email, form)

  return {
    ...account,
    message: 'Fake trial client created with completed onboarding — ready for AI plan generation.',
  }
}

/** Reset password for a trial client (admin_trial only). */
export async function resetTrialClientPassword(
  clientId: string
): Promise<CreatedAccountCredentials> {
  const profile = await assertTrialClient(clientId)
  const password = generateSecurePassword()
  const admin = createAdminClient()

  const { error } = await admin.auth.admin.updateUserById(clientId, { password })
  if (error) throw new Error(error.message)

  return {
    userId: clientId,
    clientId,
    email: profile.email ?? '',
    password,
    role: 'client',
    loginUrl: getPortalLoginUrl('client'),
    created: false,
    message: 'Trial client password reset.',
  }
}

/** Reset password for a trial coach account. */
export async function resetTrialCoachPassword(
  coachUserId: string
): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()

  const { data: coachRow, error: coachError } = await admin
    .from('coaches')
    .select('id, user_id')
    .eq('user_id', coachUserId)
    .maybeSingle()

  if (coachError) throw new Error(coachError.message)
  if (!coachRow) throw new Error('Coach not found.')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email, name')
    .eq('id', coachUserId)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)
  if (!profile?.email) throw new Error('Coach profile not found.')

  const password = generateSecurePassword()
  const { error } = await admin.auth.admin.updateUserById(coachUserId, { password })
  if (error) throw new Error(error.message)

  return {
    userId: coachUserId,
    coachId: coachRow.id,
    email: profile.email,
    password,
    role: 'coach',
    loginUrl: getPortalLoginUrl('coach'),
    created: false,
    message: 'Trial coach password reset.',
  }
}
