/**
 * Fill missing steps, sleep, and water guidance on active client plans.
 * Dry-run by default. Pass --apply to write.
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import { applyLifestyleGuidance } from '../src/lib/lifestyle-guidance'

const APPLY = process.argv.includes('--apply')
const CHUNK = 40

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  const admin = createAdminClient()
  const { data: plans, error } = await admin
    .from('plans')
    .select('id, client_id, cardio_plan, coach_notes, nutrition_plan, workout_plan, active')
    .eq('active', true)
  if (error) throw new Error(error.message)

  const clientIds = [
    ...new Set((plans ?? []).map((row) => row.client_id).filter((id): id is string => typeof id === 'string')),
  ]

  const profiles = new Map<
    string,
    { sleep_duration: string | null; onboarding_data: { lifestyle?: { dailySteps?: string | null; waterIntake?: string | null } } | null; role: string | null }
  >()
  for (const group of chunk(clientIds, 80)) {
    const { data, error: profileError } = await admin
      .from('profiles')
      .select('id, sleep_duration, onboarding_data, role')
      .in('id', group)
    if (profileError) throw new Error(profileError.message)
    for (const row of data ?? []) {
      profiles.set(row.id, {
        sleep_duration: (row.sleep_duration as string | null) ?? null,
        onboarding_data: (row.onboarding_data as { lifestyle?: { dailySteps?: string | null; waterIntake?: string | null } } | null) ?? null,
        role: (row.role as string | null) ?? null,
      })
    }
  }

  const updates: Array<{ id: string; cardio_plan: string; coach_notes: string }> = []
  let alreadyComplete = 0
  let skippedStaff = 0
  let missingDiet = 0
  let missingWorkout = 0

  for (const plan of plans ?? []) {
    const profile = profiles.get(plan.client_id)
    if (!profile) continue
    if (profile.role === 'coach' || profile.role === 'admin' || profile.role === 'super_admin') {
      skippedStaff += 1
      continue
    }
    if (!plan.nutrition_plan?.trim()) missingDiet += 1
    if (!plan.workout_plan?.trim()) missingWorkout += 1
    const next = applyLifestyleGuidance(plan, profile)
    if (!next.addedSteps && !next.addedSleepWater) {
      alreadyComplete += 1
      continue
    }
    updates.push({
      id: plan.id,
      cardio_plan: next.cardio_plan,
      coach_notes: next.coach_notes,
    })
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        activePlans: plans?.length ?? 0,
        alreadyComplete,
        toFill: updates.length,
        missingDiet,
        missingWorkout,
        skippedStaff,
      },
      null,
      2
    )
  )

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to write missing sleep, water, and steps.')
    return
  }

  for (const group of chunk(updates, CHUNK)) {
    await Promise.all(
      group.map((row) =>
        admin
          .from('plans')
          .update({
            cardio_plan: row.cardio_plan,
            coach_notes: row.coach_notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .then(({ error: updateError }) => {
            if (updateError) throw new Error(updateError.message)
          })
      )
    )
  }

  console.log(`Filled sleep, water, and steps on ${updates.length} active plans.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
