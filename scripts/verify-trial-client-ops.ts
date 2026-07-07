/**
 * Verifies trial client reset, fake client generation, and safety guards.
 * Run: npx tsx --env-file=.env.local scripts/verify-trial-client-ops.ts
 */
import { generatePlan } from '../src/lib/ai/generate-plan'
import { hasClientEntitlement } from '../src/lib/entitlements'
import { hasAccessSourceColumn } from '../src/lib/db/profile-columns'
import { TrialClientGuardError } from '../src/lib/admin/trial-client-guard'
import { resetTrialClient } from '../src/lib/admin/trial-client-reset'
import {
  createFakeTrialClient,
  createTrialClient,
  generateSecurePassword,
} from '../src/lib/admin/testing-accounts'
import { fulfillPurchase } from '../src/lib/payments/fulfillment'
import { COACHING_PLANS } from '../src/lib/payments/plans'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { OnboardingProfile } from '../src/types/database'

process.env.AI_PLAN_PROVIDER = 'mock'

const results: Record<string, 'PASS' | 'FAIL'> = {}

function pass(key: string, detail?: string): void {
  results[key] = 'PASS'
  console.log(`PASS ${key}${detail ? `: ${detail}` : ''}`)
}

function fail(key: string, detail: string): void {
  results[key] = 'FAIL'
  console.error(`FAIL ${key}: ${detail}`)
}

async function seedClientData(clientId: string): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: coach } = await admin.from('coaches').select('id').limit(1).maybeSingle()
  if (coach?.id) {
    await admin.from('checkins').insert({
      client_id: clientId,
      coach_id: coach.id,
      weight: 72,
      waist: 82,
      energy_level: 7,
      hunger_level: 5,
      training_performance: 8,
      adherence_score: 9,
      notes: 'Test check-in before reset',
      reviewed: false,
    })

    await admin.from('plans').insert({
      client_id: clientId,
      coach_id: coach.id,
      title: 'Reset Test Plan',
      workout_plan: 'Test workout',
      nutrition_plan: 'Test nutrition',
      version: 1,
      active: true,
      created_at: now,
      updated_at: now,
    })
  }

  await admin.from('profiles').update({
    onboarding_complete: true,
    plan_delivered: true,
    checkin_awaiting: true,
    fitness_goal: 'fat_loss',
    updated_at: now,
  }).eq('id', clientId)
}

async function main(): Promise<void> {
  console.log('=== Trial Client Operations Verification ===\n')
  const admin = createAdminClient()

  let fakeAccount: Awaited<ReturnType<typeof createFakeTrialClient>>
  try {
    fakeAccount = await createFakeTrialClient()
    pass('Fake client created', fakeAccount.email)
  } catch (err) {
    fail('Fake client created', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const { data: fakeProfile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', fakeAccount.userId)
    .single()

  if (fakeProfile?.onboarding_complete) {
    pass('Fake client onboarding complete')
  } else {
    fail('Fake client onboarding complete', 'onboarding_complete is false')
  }

  if (hasClientEntitlement(fakeProfile)) {
    pass('Fake client entitlement active')
  } else {
    fail('Fake client entitlement active', 'entitlement check failed')
  }

  try {
    const profile = fakeProfile as OnboardingProfile
    const planResult = await generatePlan({
      profile,
      actionId: 'initial_diet',
      coachInstructions: 'Verification test',
    })
    if (planResult.generatedPlan.nutrition_plan.meals.length > 0) {
      pass('Fake client AI plan generation')
    } else {
      fail('Fake client AI plan generation', 'empty nutrition plan')
    }
  } catch (err) {
    fail('Fake client AI plan generation', err instanceof Error ? err.message : String(err))
  }

  await seedClientData(fakeAccount.userId)

  try {
    const firstReset = await resetTrialClient(fakeAccount.userId)
    pass('Trial client reset (first)', `deleted ${firstReset.deleted.plans} plan(s)`)
  } catch (err) {
    fail('Trial client reset (first)', err instanceof Error ? err.message : String(err))
  }

  const includeAccessSource = await hasAccessSourceColumn()
  const resetColumns = includeAccessSource
    ? 'onboarding_complete, plan_delivered, payment_confirmed, access_source'
    : 'onboarding_complete, plan_delivered, payment_confirmed'

  const { data: afterReset } = await admin
    .from('profiles')
    .select(resetColumns)
    .eq('id', fakeAccount.userId)
    .single()

  const { count: planCount } = await admin
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', fakeAccount.userId)

  if (!afterReset?.onboarding_complete && !afterReset?.plan_delivered && (planCount ?? 0) === 0) {
    pass('Coaching data cleared after reset')
  } else {
    fail('Coaching data cleared after reset', JSON.stringify({ afterReset, planCount }))
  }

  if (hasClientEntitlement(afterReset)) {
    pass('Entitlement remains after reset')
  } else {
    fail('Entitlement remains after reset', 'payment/entitlement lost')
  }

  try {
    await resetTrialClient(fakeAccount.userId)
    pass('Trial client reset (second)')
  } catch (err) {
    fail('Trial client reset (second)', err instanceof Error ? err.message : String(err))
  }

  const paidEmail = `paid-guard-${Date.now()}@example.com`
  try {
    await fulfillPurchase({
      email: paidEmail,
      password: generateSecurePassword(),
      name: 'Paid Guard Test',
      plan: COACHING_PLANS['6_months'],
      razorpayPaymentId: `guard_pay_${Date.now()}`,
      razorpayOrderId: `guard_order_${Date.now()}`,
      amountPaise: COACHING_PLANS['6_months'].amountPaise,
    })

    const { data: paidProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', paidEmail)
      .single()

    let blocked = false
    try {
      await resetTrialClient(paidProfile!.id)
    } catch (err) {
      if (err instanceof TrialClientGuardError) blocked = true
    }

    if (blocked) {
      pass('Paying customer reset blocked')
    } else {
      fail('Paying customer reset blocked', 'reset succeeded for paid customer')
    }
  } catch (err) {
    fail('Paying customer reset blocked', err instanceof Error ? err.message : String(err))
  }

  console.log('\n=== Summary ===')
  for (const key of Object.keys(results)) {
    console.log(`${key}: ${results[key]}`)
  }

  const allPass = Object.values(results).every((v) => v === 'PASS')
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
