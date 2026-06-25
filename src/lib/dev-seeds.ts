import { activatePlan } from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'

const TEST_PASSWORD = 'TestPass123!'

export type SeedResult = {
  message: string
  data?: Record<string, unknown>
}

function timestamp(): string {
  return Date.now().toString(36)
}

export async function seedCreateTestClient(): Promise<SeedResult> {
  const admin = createAdminClient()
  const email = `test-client-${timestamp()}@dev.local`

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? 'Failed to create test client auth user')
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: authData.user.id,
    email,
    name: 'Test Client',
    onboarding_complete: false,
    plan_delivered: false,
    checkin_awaiting: false,
    checkin_overdue: false,
  })

  if (profileError) throw new Error(profileError.message)

  return {
    message: 'Test client created',
    data: { clientId: authData.user.id, email, password: TEST_PASSWORD },
  }
}

export async function seedCreateTestCoach(): Promise<SeedResult> {
  const admin = createAdminClient()
  const email = `test-coach-${timestamp()}@dev.local`

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'coach' },
  })

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? 'Failed to create test coach auth user')
  }

  const { data: coachRow, error: coachError } = await admin
    .from('coaches')
    .insert({
      user_id: authData.user.id,
      name: 'Test Coach',
      hard_cap: 100,
    })
    .select()
    .single()

  if (coachError || !coachRow) throw new Error(coachError?.message ?? 'Failed to create coach record')

  return {
    message: 'Test coach created',
    data: { coachId: coachRow.id, userId: authData.user.id, email, password: TEST_PASSWORD },
  }
}

export async function seedAssignClientToCoach(
  clientId: string,
  coachId: string
): Promise<SeedResult> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('profiles')
    .update({ coach_id: coachId, updated_at: new Date().toISOString() })
    .eq('id', clientId)

  if (error) throw new Error(error.message)

  return {
    message: 'Client assigned to coach',
    data: { clientId, coachId },
  }
}

export async function seedMarkOnboardingComplete(clientId: string): Promise<SeedResult> {
  const admin = createAdminClient()

  const { error } = await admin.from('profiles').update({
    name: 'Test Client',
    age: 28,
    gender: 'male',
    height: 175,
    weight: 72,
    fitness_goal: 'fat_loss',
    training_experience: 'intermediate',
    activity_level: 'moderately_active',
    diet_preference: 'non_vegetarian',
    injuries: null,
    medical_notes: null,
    sleep_duration: '7_to_8',
    onboarding_complete: true,
    updated_at: new Date().toISOString(),
  }).eq('id', clientId)

  if (error) throw new Error(error.message)

  return { message: 'Onboarding marked complete', data: { clientId } }
}

export async function seedCreateSampleCheckin(
  clientId: string,
  coachId: string
): Promise<SeedResult> {
  const admin = createAdminClient()
  const placeholder = 'https://placehold.co/400x600/1a1a2e/ffffff?text=Progress'

  const { data: checkin, error } = await admin
    .from('checkins')
    .insert({
      client_id: clientId,
      coach_id: coachId,
      weight: 72,
      waist: 82,
      progress_photo_front: placeholder,
      progress_photo_side: placeholder,
      progress_photo_back: placeholder,
      energy_level: 7,
      hunger_level: 5,
      training_performance: 8,
      adherence_score: 9,
      notes: 'Sample check-in for dev testing. Feeling good this week!',
      reviewed: false,
    })
    .select()
    .single()

  if (error || !checkin) throw new Error(error?.message ?? 'Failed to create check-in')

  await admin.from('profiles').update({ checkin_awaiting: true }).eq('id', clientId)

  return {
    message: 'Sample check-in created',
    data: { checkinId: checkin.id, clientId, coachId },
  }
}

export async function seedCreateSamplePlan(
  clientId: string,
  coachId: string
): Promise<SeedResult> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: plan, error } = await admin
    .from('plans')
    .insert({
      client_id: clientId,
      coach_id: coachId,
      title: 'Sample Coaching Plan',
      phase: 'Phase 1 — Foundation',
      workout_plan: 'Mon: Upper body push\nWed: Lower body\nFri: Upper pull\nSat: Active recovery walk',
      nutrition_plan: 'Protein: 140g/day\nCalories: 2000\nMeals: 3 main + 1 snack',
      cardio_plan: '3x/week 20 min incline walk post-workout',
      supplement_plan: 'Whey protein, creatine 5g daily, vitamin D',
      coach_notes: 'Sample plan for dev testing. Adjust based on weekly check-ins.',
      version: 1,
      active: false,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !plan) throw new Error(error?.message ?? 'Failed to create plan')

  return {
    message: 'Sample plan created (inactive)',
    data: { planId: plan.id, clientId, coachId },
  }
}

export async function seedActivateSamplePlan(planId: string): Promise<SeedResult> {
  const admin = createAdminClient()

  const { data: plan, error } = await admin
    .from('plans')
    .select('id, client_id')
    .eq('id', planId)
    .single()

  if (error || !plan) throw new Error(error?.message ?? 'Plan not found')

  const { error: activateError } = await activatePlan(admin, plan)
  if (activateError) throw new Error(activateError)

  return {
    message: 'Plan activated and delivered',
    data: { planId: plan.id, clientId: plan.client_id },
  }
}

export async function seedListEntities(): Promise<SeedResult> {
  const admin = createAdminClient()

  const [{ data: clients }, { data: coaches }] = await Promise.all([
    admin.from('profiles').select('id, name, email, coach_id').order('name'),
    admin.from('coaches').select('id, name, user_id').order('name'),
  ])

  return {
    message: 'Entities loaded',
    data: { clients: clients ?? [], coaches: coaches ?? [] },
  }
}

export type SeedAction =
  | 'create_test_client'
  | 'create_test_coach'
  | 'assign_client_to_coach'
  | 'mark_onboarding_complete'
  | 'create_sample_checkin'
  | 'create_sample_plan'
  | 'activate_sample_plan'
  | 'list_entities'

export async function runSeedAction(
  action: SeedAction,
  payload: Record<string, string> = {}
): Promise<SeedResult> {
  switch (action) {
    case 'create_test_client':
      return seedCreateTestClient()
    case 'create_test_coach':
      return seedCreateTestCoach()
    case 'assign_client_to_coach':
      return seedAssignClientToCoach(payload.clientId, payload.coachId)
    case 'mark_onboarding_complete':
      return seedMarkOnboardingComplete(payload.clientId)
    case 'create_sample_checkin':
      return seedCreateSampleCheckin(payload.clientId, payload.coachId)
    case 'create_sample_plan':
      return seedCreateSamplePlan(payload.clientId, payload.coachId)
    case 'activate_sample_plan':
      return seedActivateSamplePlan(payload.planId)
    case 'list_entities':
      return seedListEntities()
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
