/**
 * READ-ONLY: count regular (non-trial) entitled clients whose ACTIVE diet
 * sits above Mifflin preferred + 150 kcal slack.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createAdminClient } from '../src/lib/supabase/admin'
import { resolveClientCalorieTargets } from '../src/lib/ai/calorie-targets'
import {
  getAuthoritativeNutritionCalories,
  isDietOverPreferredTarget,
  PREFERRED_MAX_SLACK_KCAL,
  parseHeaderCalories,
} from '../src/lib/ai/nutrition-macro-sync'
import { hasClientEntitlement, isAdminTrialClient } from '../src/lib/entitlements'
import type { OnboardingProfile } from '../src/types/database'

type PlanRow = {
  id: string
  client_id: string
  title: string | null
  version: number | null
  nutrition_plan: string | null
  delivered_at: string | null
  profiles: {
    id: string
    name: string | null
    email: string | null
    payment_confirmed: boolean | null
    access_source: string | null
    subscription_expires_at: string | null
    weight: number | null
    height: number | null
    age: number | null
    gender: string | null
    activity_level: string | null
    fitness_goal: string | null
    onboarding_data: OnboardingProfile['onboarding_data'] | null
  } | null
}

async function main() {
  const admin = createAdminClient()

  const { data: rows, error } = await admin
    .from('plans')
    .select(
      `id, client_id, title, version, nutrition_plan, delivered_at,
       profiles:client_id(
         id, name, email, payment_confirmed, access_source, subscription_expires_at,
         weight, height, age, gender, activity_level, fitness_goal, onboarding_data
       )`
    )
    .eq('active', true)
    .not('delivered_at', 'is', null)
    .not('nutrition_plan', 'is', null)
    .neq('nutrition_plan', '')

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  const overfed: Array<Record<string, unknown>> = []
  let scannedActive = 0
  let regularEntitled = 0
  let trialSkipped = 0
  let notEntitled = 0
  let noTargets = 0
  let okCalories = 0

  for (const row of (rows ?? []) as PlanRow[]) {
    scannedActive += 1
    const prof = row.profiles
    if (!prof) {
      notEntitled += 1
      continue
    }
    if (isAdminTrialClient(prof)) {
      trialSkipped += 1
      continue
    }
    if (!hasClientEntitlement(prof)) {
      notEntitled += 1
      continue
    }
    regularEntitled += 1

    const targets = resolveClientCalorieTargets(prof as OnboardingProfile)
    if (!targets?.preferred) {
      noTargets += 1
      continue
    }

    const authoritative = getAuthoritativeNutritionCalories({
      calories: parseHeaderCalories(row.nutrition_plan) ?? 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      meals: [{ example: row.nutrition_plan ?? '' }],
    })

    if (!isDietOverPreferredTarget(authoritative, targets.preferred)) {
      okCalories += 1
      continue
    }

    overfed.push({
      clientId: prof.id,
      name: prof.name,
      email: prof.email,
      planId: row.id,
      title: row.title,
      version: row.version,
      deliveredAt: row.delivered_at,
      planCalories: authoritative,
      preferred: targets.preferred,
      maintenance: targets.maintenance,
      slack: PREFERRED_MAX_SLACK_KCAL,
      overBy: authoritative - targets.preferred,
      overByVsSlack: authoritative - (targets.preferred + PREFERRED_MAX_SLACK_KCAL),
      goal: prof.fitness_goal,
      activity: prof.activity_level,
    })
  }

  overfed.sort((a, b) => Number(b.overBy) - Number(a.overBy))

  mkdirSync('scripts/out', { recursive: true })
  writeFileSync(
    'scripts/out/overfed-regular-clients.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        definition:
          'Regular = payment_confirmed entitled, not admin_trial. Wrong = active plan authoritative kcal > preferred + 150.',
        scannedActive,
        trialSkipped,
        notEntitled,
        regularEntitled,
        noTargets,
        okCalories,
        overfedCount: overfed.length,
        overfed,
      },
      null,
      2
    )
  )

  console.log('=== Regular clients with overfed active diets (READ ONLY) ===')
  console.log(`Active delivered plans scanned : ${scannedActive}`)
  console.log(`Admin trial skipped            : ${trialSkipped}`)
  console.log(`Not entitled / no profile      : ${notEntitled}`)
  console.log(`Regular entitled clients       : ${regularEntitled}`)
  console.log(`No Mifflin targets             : ${noTargets}`)
  console.log(`Calories OK (<= preferred+150) : ${okCalories}`)
  console.log(`OVERFED (wrong calories)       : ${overfed.length}`)
  console.log('')
  if (overfed.length) {
    console.log('--- Worst offenders ---')
    for (const row of overfed.slice(0, 25)) {
      console.log(
        `  ${row.name ?? row.email} | plan=${row.planCalories} preferred=${row.preferred} overBy=${row.overBy} (+${row.overByVsSlack} past slack) | ${row.goal}`
      )
    }
    if (overfed.length > 25) console.log(`  ...and ${overfed.length - 25} more`)
  }
  console.log('')
  console.log('Report: scripts/out/overfed-regular-clients.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
