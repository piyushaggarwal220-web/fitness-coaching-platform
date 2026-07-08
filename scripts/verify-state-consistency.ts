/**
 * Production state consistency verification.
 * Run: npx tsx --env-file=.env.local scripts/verify-state-consistency.ts
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import { hasAccessSourceColumn } from '../src/lib/db/profile-columns'
import {
  DEMO_ADMIN_EMAIL,
  DEMO_CLIENT_EMAIL,
  DEMO_COACH_EMAIL,
} from '../src/lib/admin/testing-accounts'

const results: Record<string, 'PASS' | 'FAIL' | 'SKIP'> = {}

function pass(id: string, detail?: string): void {
  results[id] = 'PASS'
  console.log(`PASS ${id}${detail ? `: ${detail}` : ''}`)
}

function fail(id: string, detail: string): void {
  results[id] = 'FAIL'
  console.error(`FAIL ${id}: ${detail}`)
}

function skip(id: string, reason: string): void {
  results[id] = 'SKIP'
  console.log(`SKIP ${id}: ${reason}`)
}

async function main(): Promise<void> {
  console.log('=== Production State Consistency Verification ===\n')

  const admin = createAdminClient()
  const hasAccessSource = await hasAccessSourceColumn()

  if (hasAccessSource) {
    const { count: entitlementGap } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('payment_confirmed', true)
      .eq('role', 'client')
      .is('access_source', null)

    if ((entitlementGap ?? 0) === 0) {
      pass('entitlement_source_set', 'all paid clients tagged')
    } else {
      fail('entitlement_source_set', `${entitlementGap} clients missing access_source`)
    }
  } else {
    skip('entitlement_source_set', 'access_source column missing')
  }

  await runCheck(admin, 'plan_delivered_no_active_plan', async () => {
    const { data } = await admin.from('profiles').select('id').eq('plan_delivered', true)
    if (!data?.length) return 0
    let violations = 0
    for (const row of data) {
      const { count } = await admin
        .from('plans')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', row.id)
        .eq('active', true)
      if (!count) violations++
    }
    return violations
  })

  await runCheck(admin, 'active_plan_flag_false', async () => {
    const { data: activePlans } = await admin.from('plans').select('client_id').eq('active', true)
    const clientIds = [...new Set((activePlans ?? []).map((p) => p.client_id))]
    if (!clientIds.length) return 0
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('id', clientIds)
      .eq('plan_delivered', false)
    return count ?? 0
  })

  await runCheck(admin, 'plan_delivered_onboarding_incomplete', async () => {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('plan_delivered', true)
      .eq('onboarding_complete', false)
    return count ?? 0
  })

  await runCheck(admin, 'coach_assigned_missing_coach', async () => {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, coach_id')
      .not('coach_id', 'is', null)
    if (!profiles?.length) return 0
    const coachIds = [...new Set(profiles.map((p) => p.coach_id).filter(Boolean))] as string[]
    const { data: coaches } = await admin.from('coaches').select('id').in('id', coachIds)
    const valid = new Set((coaches ?? []).map((c) => c.id))
    return profiles.filter((p) => p.coach_id && !valid.has(p.coach_id)).length
  })

  await runCheck(admin, 'plan_coach_mismatch', async () => {
    const { data: plans } = await admin.from('plans').select('client_id, coach_id')
    if (!plans?.length) return 0
    let violations = 0
    for (const plan of plans) {
      const { data: profile } = await admin
        .from('profiles')
        .select('coach_id')
        .eq('id', plan.client_id)
        .maybeSingle()
      if (profile?.coach_id && profile.coach_id !== plan.coach_id) violations++
    }
    return violations
  })

  await runCheck(admin, 'multiple_active_plans_per_client', async () => {
    const { data } = await admin.from('plans').select('client_id').eq('active', true)
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1)
    }
    return [...counts.values()].filter((n) => n > 1).length
  })

  await runCheck(admin, 'active_plan_no_delivered_at', async () => {
    const { count } = await admin
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .is('delivered_at', null)
    return count ?? 0
  })

  await runCheck(admin, 'purchase_no_entitlement', async () => {
    const { data: purchases } = await admin.from('purchases').select('user_id').not('user_id', 'is', null)
    if (!purchases?.length) return 0
    const userIds = [...new Set(purchases.map((p) => p.user_id).filter(Boolean))] as string[]
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('id', userIds)
      .eq('payment_confirmed', false)
    return count ?? 0
  })

  await runCheck(admin, 'coach_orphan_profile', async () => {
    const { data: coaches } = await admin.from('coaches').select('id, user_id')
    if (!coaches?.length) return 0
    const userIds = coaches.map((c) => c.user_id)
    const { data: profiles } = await admin.from('profiles').select('id').in('id', userIds)
    const valid = new Set((profiles ?? []).map((p) => p.id))
    return coaches.filter((c) => !valid.has(c.user_id)).length
  })

  await verifyDemoAccount(admin, 'demo_admin', DEMO_ADMIN_EMAIL, ['admin', 'super_admin'])
  await verifyDemoCoach(admin)
  await verifyDemoClient(admin)

  console.log('\n=== Environment Configuration ===\n')
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (process.env[key]?.trim()) pass(`env:${key}`)
    else fail(`env:${key}`, 'missing (required)')
  }
  for (const key of ['NEXT_PUBLIC_APP_URL', 'ANTHROPIC_API_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']) {
    if (process.env[key]?.trim()) pass(`env:${key}`)
    else skip(`env:${key}`, 'not set (recommended)')
  }

  console.log('\n=== Summary ===')
  for (const [key, value] of Object.entries(results)) {
    console.log(`${key}: ${value}`)
  }

  const failures = Object.values(results).filter((v) => v === 'FAIL').length
  process.exit(failures > 0 ? 1 : 0)
}

async function runCheck(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  fn: () => Promise<number>
): Promise<void> {
  try {
    const count = await fn()
    if (count === 0) pass(id)
    else fail(id, `found ${count} violation(s)`)
  } catch (err) {
    fail(id, err instanceof Error ? err.message : String(err))
  }
}

async function verifyDemoAccount(
  admin: ReturnType<typeof createAdminClient>,
  label: string,
  email: string,
  roles: string[]
): Promise<void> {
  const { data: profile } = await admin.from('profiles').select('id, role, email').eq('email', email).maybeSingle()
  if (!profile?.id) {
    fail(`demo:${label}`, 'profile not found')
    return
  }
  if (!roles.includes(profile.role ?? '')) {
    fail(`demo:${label}`, `role=${profile.role}`)
    return
  }
  pass(`demo:${label}`, profile.role ?? undefined)
}

async function verifyDemoCoach(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', DEMO_COACH_EMAIL)
    .maybeSingle()
  if (!profile?.id) {
    fail('demo:coach', 'profile missing')
    return
  }
  const { data: coach } = await admin.from('coaches').select('id').eq('user_id', profile.id).maybeSingle()
  if (!coach?.id) {
    fail('demo:coach', 'coaches row missing')
    return
  }
  pass('demo:coach', coach.id)
}

async function verifyDemoClient(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id, onboarding_complete, plan_delivered, payment_confirmed, access_source, coach_id')
    .eq('email', DEMO_CLIENT_EMAIL)
    .maybeSingle()

  if (!profile?.id) {
    fail('demo:client', 'profile missing')
    return
  }

  if (!profile.payment_confirmed) fail('demo:client_entitlement', 'payment_confirmed false')
  else pass('demo:client_entitlement')

  if (profile.plan_delivered && !profile.onboarding_complete) {
    fail('demo:client_workflow', 'plan delivered but onboarding incomplete')
  } else {
    pass('demo:client_workflow')
  }

  if (profile.plan_delivered) {
    const { count } = await admin
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', profile.id)
      .eq('active', true)
    if (!count) fail('demo:client_active_plan', 'plan_delivered but no active plan')
    else pass('demo:client_active_plan')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
