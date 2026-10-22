/**
 * Entitle Athletic body (12-month) men to the testosterone protocol.
 * Hourglass for women is applied at plan generation from plan slug + gender.
 * Dry-run by default. Pass --apply to write.
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import { isAthleticBodyPlan, planIncludesTestosteroneBoost } from '../src/lib/athletic-body-extras'

const APPLY = process.argv.includes('--apply')
const CHUNK = 40

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  const admin = createAdminClient()
  const { data: purchases, error } = await admin
    .from('purchases')
    .select('user_id, plan_slug, status')
    .in('status', ['captured', 'redeemed'])
    .eq('plan_slug', '12_months')
  if (error) throw new Error(error.message)

  const athleticIds = [
    ...new Set(
      (purchases ?? [])
        .map((row) => row.user_id)
        .filter((id): id is string => typeof id === 'string')
    ),
  ]

  const profiles: Array<{
    id: string
    gender: string | null
    role: string | null
    supplement_protocol_entitled: boolean | null
  }> = []
  for (const group of chunk(athleticIds, 80)) {
    const { data, error: profileError } = await admin
      .from('profiles')
      .select('id, gender, role, supplement_protocol_entitled')
      .in('id', group)
    if (profileError) throw new Error(profileError.message)
    profiles.push(...((data ?? []) as typeof profiles))
  }

  const entitleMen: string[] = []
  let alreadyMen = 0
  let women = 0
  let skippedStaff = 0
  let skippedUnknownGender = 0

  for (const profile of profiles) {
    if (profile.role === 'coach' || profile.role === 'admin' || profile.role === 'super_admin') {
      skippedStaff += 1
      continue
    }
    if (profile.gender === 'female') {
      women += 1
      continue
    }
    if (!planIncludesTestosteroneBoost('12_months', profile.gender)) {
      skippedUnknownGender += 1
      continue
    }
    if (profile.supplement_protocol_entitled === true) alreadyMen += 1
    else entitleMen.push(profile.id)
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        athleticPurchases: purchases?.length ?? 0,
        athleticClients: profiles.length,
        entitleMen: entitleMen.length,
        alreadyMen,
        women,
        skippedStaff,
        skippedUnknownGender,
        hourglassNote:
          'Women keep hourglass on the next generated plan. No profile flag is written.',
        athleticBody: isAthleticBodyPlan('12_months'),
      },
      null,
      2
    )
  )

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to entitle Athletic body men.')
    return
  }

  for (const group of chunk(entitleMen, CHUNK)) {
    const { error: updateError } = await admin
      .from('profiles')
      .update({ supplement_protocol_entitled: true, updated_at: new Date().toISOString() })
      .in('id', group)
    if (updateError) throw new Error(updateError.message)
  }

  console.log(`Entitled ${entitleMen.length} Athletic body men to the testosterone protocol.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
