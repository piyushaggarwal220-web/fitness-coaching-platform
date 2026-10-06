/**
 * Repair regular (non-trial, entitled) clients whose ACTIVE diet is above Mifflin preferred + 150.
 * Deterministically scales meal/daily macro lines to the preferred target, then updates the active plan.
 *
 * Default: dry-run. Pass --apply to write.
 *   npx tsx --env-file=.env.local scripts/repair-overfed-regular-clients.ts
 *   npx tsx --env-file=.env.local scripts/repair-overfed-regular-clients.ts --apply
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { createAdminClient } from '../src/lib/supabase/admin'
import { resolveClientCalorieTargets } from '../src/lib/ai/calorie-targets'
import {
  getAuthoritativeNutritionCalories,
  isDietOverPreferredTarget,
  parseHeaderCalories,
  PREFERRED_MAX_SLACK_KCAL,
  scaleDietTextToCalorieTarget,
} from '../src/lib/ai/nutrition-macro-sync'
import { notifyDietCalorieShift } from '../src/lib/ai/plan-publish-notice'
import { hasClientEntitlement, isAdminTrialClient } from '../src/lib/entitlements'
import type { OnboardingProfile } from '../src/types/database'

const APPLY = process.argv.includes('--apply')
const LIMIT = (() => {
  const raw = process.argv.find((a) => a.startsWith('--limit='))
  if (!raw) return null
  const n = Number(raw.slice('--limit='.length))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
})()

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

function planCalories(text: string): number {
  return getAuthoritativeNutritionCalories({
    calories: parseHeaderCalories(text) ?? 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    meals: [{ example: text }],
  })
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

  type RepairRow = {
    clientId: string
    name: string | null
    email: string | null
    planId: string
    before: number
    preferred: number
    after: number
    stillOverfed: boolean
    applied: boolean
    error?: string
  }

  const repairs: RepairRow[] = []
  let skippedOk = 0
  let skippedTrial = 0
  let skippedOther = 0

  for (const row of (rows ?? []) as PlanRow[]) {
    const prof = row.profiles
    if (!prof) {
      skippedOther += 1
      continue
    }
    if (isAdminTrialClient(prof)) {
      skippedTrial += 1
      continue
    }
    if (!hasClientEntitlement(prof)) {
      skippedOther += 1
      continue
    }

    const targets = resolveClientCalorieTargets(prof as OnboardingProfile)
    const preferred = targets?.preferred
    if (!preferred) {
      skippedOther += 1
      continue
    }

    const before = planCalories(row.nutrition_plan ?? '')
    if (!isDietOverPreferredTarget(before, preferred)) {
      skippedOk += 1
      continue
    }

    const scaled = scaleDietTextToCalorieTarget(row.nutrition_plan ?? '', preferred)
    const after = planCalories(scaled)
    const stillOverfed = isDietOverPreferredTarget(after, preferred)

    const entry: RepairRow = {
      clientId: prof.id,
      name: prof.name,
      email: prof.email,
      planId: row.id,
      before,
      preferred,
      after,
      stillOverfed,
      applied: false,
    }

    if (APPLY && !stillOverfed) {
      const { error: updErr } = await admin
        .from('plans')
        .update({ nutrition_plan: scaled })
        .eq('id', row.id)
        .eq('active', true)
      if (updErr) {
        entry.error = updErr.message
      } else {
        entry.applied = true
        try {
          await notifyDietCalorieShift(admin, {
            clientId: prof.id,
            previousNutrition: row.nutrition_plan,
            nextNutrition: scaled,
            reason: 'publish',
          })
        } catch (err) {
          entry.error = `saved but notice failed: ${err instanceof Error ? err.message : String(err)}`
        }
      }
    } else if (APPLY && stillOverfed) {
      entry.error = 'scaled text still overfed — skipped write'
    }

    repairs.push(entry)
    if (LIMIT != null && repairs.length >= LIMIT) break
  }

  mkdirSync('scripts/out', { recursive: true })
  const outPath = APPLY
    ? 'scripts/out/overfed-repair-applied.json'
    : 'scripts/out/overfed-repair-dry-run.json'
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        slack: PREFERRED_MAX_SLACK_KCAL,
        skippedOk,
        skippedTrial,
        skippedOther,
        repairCount: repairs.length,
        wouldFix: repairs.filter((r) => !r.stillOverfed).length,
        stillBroken: repairs.filter((r) => r.stillOverfed).length,
        applied: repairs.filter((r) => r.applied).length,
        repairs,
      },
      null,
      2
    )
  )

  console.log(`=== Overfed regular-client repair (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`)
  console.log(`Already OK skipped     : ${skippedOk}`)
  console.log(`Trial skipped          : ${skippedTrial}`)
  console.log(`Other skipped          : ${skippedOther}`)
  console.log(`Overfed found          : ${repairs.length}`)
  console.log(`Scales cleanly         : ${repairs.filter((r) => !r.stillOverfed).length}`)
  console.log(`Still broken after scale: ${repairs.filter((r) => r.stillOverfed).length}`)
  if (APPLY) console.log(`Applied to DB          : ${repairs.filter((r) => r.applied).length}`)
  console.log(`Report: ${outPath}`)

  const broken = repairs.filter((r) => r.stillOverfed).slice(0, 10)
  if (broken.length) {
    console.log('--- Still overfed after scale (sample) ---')
    for (const r of broken) {
      console.log(`  ${r.name ?? r.email} before=${r.before} preferred=${r.preferred} after=${r.after}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
