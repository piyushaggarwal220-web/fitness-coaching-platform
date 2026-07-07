/**
 * Verifies Complexity Score system integration.
 * Run: npx tsx --env-file=.env.local scripts/verify-complexity-score-system.ts
 */
import {
  calculateComplexityScore,
  getTierFromScore,
  toDisplayScore,
  SCORING_SPEC,
} from '../src/lib/ai/complexity-score'
import { getComplexityAnalytics } from '../src/lib/complexity/analytics'
import { profileToComplexityInput } from '../src/lib/complexity/profile-input'
import { recalculateClientComplexityAdmin } from '../src/lib/complexity/recalculate'
import { createAdminClient } from '../src/lib/supabase/admin'
import type { OnboardingProfile } from '../src/types/database'

const results: Record<string, 'PASS' | 'FAIL'> = {}

function pass(key: string, detail?: string): void {
  results[key] = 'PASS'
  console.log(`PASS ${key}${detail ? `: ${detail}` : ''}`)
}

function fail(key: string, detail: string): void {
  results[key] = 'FAIL'
  console.error(`FAIL ${key}: ${detail}`)
}

const sampleProfile: OnboardingProfile = {
  id: 'complexity-verify-client',
  email: 'complexity-verify@example.com',
  name: 'Complexity Verify',
  role: 'client',
  coach_id: null,
  age: 52,
  gender: 'female',
  height: 165,
  weight: 82,
  fitness_goal: 'fat_loss',
  activity_level: 'sedentary',
  training_experience: 'beginner',
  diet_preference: 'vegetarian',
  injuries: 'Knee pain',
  medical_notes: 'Hypertension',
  sleep_duration: 'less_than_6',
  onboarding_complete: true,
  onboarding_data: { version: 1, resumeStep: 10 },
  plan_delivered: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function verifyAlgorithm(): void {
  const input = profileToComplexityInput(sampleProfile, {
    id: 'c1',
    client_id: sampleProfile.id,
    coach_id: 'coach',
    submitted_at: new Date().toISOString(),
    weight: 80,
    waist: 75,
    progress_photo_front: null,
    progress_photo_side: null,
    progress_photo_back: null,
    energy_level: 3,
    hunger_level: 9,
    training_performance: 3,
    adherence_score: 4,
    notes: 'Struggling this week',
    coach_response: null,
    reviewed: false,
    reviewed_at: null,
  })

  const result = calculateComplexityScore(input)
  const display = toDisplayScore(result.score)
  const tier = getTierFromScore(result.score)

  if (result.score <= 0) {
    fail('Algorithm scoring', 'expected positive raw score for complex profile')
    return
  }
  if (display < 1 || display > 100) {
    fail('Display score range', `display=${display}`)
    return
  }
  if (result.tier !== tier) {
    fail('Tier mapping', `mismatch ${result.tier} vs ${tier}`)
    return
  }
  if (SCORING_SPEC.display.MAX_RAW_SCORE !== 33) {
    fail('SCORING_SPEC display max', 'unexpected MAX_RAW_SCORE')
    return
  }
  pass('Algorithm scoring', `raw=${result.score}, display=${display}, tier=${result.tier}`)
}

async function verifyPersistence(): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('email', 'complexity-verify@example.com')
    .maybeSingle()

  let clientId = existing?.id as string | undefined

  if (!clientId) {
    const { data: created, error } = await admin
      .from('profiles')
      .insert({
        id: crypto.randomUUID(),
        email: sampleProfile.email,
        name: sampleProfile.name,
        role: 'client',
        age: sampleProfile.age,
        gender: sampleProfile.gender,
        height: sampleProfile.height,
        weight: sampleProfile.weight,
        fitness_goal: sampleProfile.fitness_goal,
        activity_level: sampleProfile.activity_level,
        training_experience: sampleProfile.training_experience,
        diet_preference: sampleProfile.diet_preference,
        injuries: sampleProfile.injuries,
        medical_notes: sampleProfile.medical_notes,
        sleep_duration: sampleProfile.sleep_duration,
        onboarding_complete: true,
        onboarding_data: sampleProfile.onboarding_data,
      })
      .select('id')
      .single()

    if (error || !created) {
      fail('Persistence setup', error?.message ?? 'could not create test profile')
      return
    }
    clientId = created.id as string
  }

  const first = await recalculateClientComplexityAdmin(clientId, { trigger: 'onboarding_complete' })
  if (!first) {
    fail('Onboarding calculation', 'recalculate returned null')
    return
  }

  const { data: afterFirst } = await admin.from('profiles').select('complexity_score, complexity_tier').eq('id', clientId).single()
  const { count: historyCount } = await admin
    .from('complexity_score_history')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)

  if (!afterFirst?.complexity_score || !afterFirst.complexity_tier) {
    fail('Profile fields stored', 'missing complexity fields on profile')
    return
  }
  if ((historyCount ?? 0) < 1) {
    fail('History record', 'no history after first calculation')
    return
  }

  const second = await recalculateClientComplexityAdmin(clientId, {
    trigger: 'weekly_checkin',
    checkinId: null,
  })

  const { count: historyCount2 } = await admin
    .from('complexity_score_history')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)

  if (!second) {
    fail('Recalculation', 'second run returned null')
    return
  }
  if ((historyCount2 ?? 0) < 2) {
    fail('History append-only', 'expected second history row')
    return
  }

  pass('Onboarding calculation', `score=${first.displayScore}, tier=${first.tier}`)
  pass('History stored', `${historyCount2} records`)
  pass('Recalculation', `change=${second.scoreChange ?? 'n/a'}`)
}

async function verifyAnalytics(): Promise<void> {
  try {
    const analytics = await getComplexityAnalytics()
    if (!analytics.distribution || analytics.distributionChart.length !== 3) {
      fail('Admin analytics', 'invalid distribution shape')
      return
    }
    pass('Admin analytics', `total=${analytics.distribution.total} clients scored`)
  } catch (err) {
    fail('Admin analytics', err instanceof Error ? err.message : String(err))
  }
}

async function main(): Promise<void> {
  console.log('=== Complexity Score System Verification ===\n')

  verifyAlgorithm()
  await verifyPersistence()
  await verifyAnalytics()

  console.log('\n=== Summary ===')
  for (const key of ['Algorithm scoring', 'Onboarding calculation', 'History stored', 'Recalculation', 'Admin analytics']) {
    console.log(`${key}: ${results[key] ?? 'SKIP'}`)
  }

  const allPass = Object.values(results).every((v) => v === 'PASS')
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
