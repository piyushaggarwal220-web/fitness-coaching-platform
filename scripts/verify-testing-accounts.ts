/**
 * Verifies Testing & Demo Account system.
 * Run: npx tsx --env-file=.env.local scripts/verify-testing-accounts.ts
 */
import { hasClientEntitlement } from '../src/lib/entitlements'
import {
  DEMO_ADMIN_EMAIL,
  DEMO_CLIENT_EMAIL,
  DEMO_COACH_EMAIL,
} from '../src/lib/admin/testing-accounts'
import { getPortalLoginUrls } from '../src/lib/admin/portal-urls'
import { hasAccessSourceColumn } from '../src/lib/db/profile-columns'
import { createAdminClient } from '../src/lib/supabase/admin'

const results: Record<string, 'PASS' | 'FAIL'> = {}

function pass(key: string, detail?: string): void {
  results[key] = 'PASS'
  console.log(`PASS ${key}${detail ? `: ${detail}` : ''}`)
}

function fail(key: string, detail: string): void {
  results[key] = 'FAIL'
  console.error(`FAIL ${key}: ${detail}`)
}

async function findProfileByEmail(email: string) {
  const admin = createAdminClient()
  const includeAccessSource = await hasAccessSourceColumn()
  const columns = includeAccessSource
    ? 'id, email, payment_confirmed, access_source, onboarding_complete'
    : 'id, email, payment_confirmed, onboarding_complete'

  const { data: byEmail, error } = await admin
    .from('profiles')
    .select(columns)
    .eq('email', email)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (byEmail) return byEmail

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const authUser = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  if (!authUser) return null

  const { data: byId } = await admin.from('profiles').select(columns).eq('id', authUser.id).maybeSingle()
  return byId
}

async function main(): Promise<void> {
  const admin = createAdminClient()

  console.log('=== Testing & Demo Account Verification ===\n')

  const { data: adminProfile } = await admin
    .from('profiles')
    .select('id, role, email')
    .eq('email', DEMO_ADMIN_EMAIL)
    .maybeSingle()

  if (adminProfile?.role === 'super_admin' || adminProfile?.role === 'admin') {
    pass('Admin account exists', adminProfile.role)
  } else {
    fail('Admin account exists', `missing or wrong role (${adminProfile?.role ?? 'not found'})`)
  }

  const { data: coachProfile } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', DEMO_COACH_EMAIL)
    .maybeSingle()

  const { data: coachRow } = coachProfile?.id
    ? await admin.from('coaches').select('id').eq('user_id', coachProfile.id).maybeSingle()
    : { data: null }

  if (coachProfile?.id && coachRow?.id) {
    pass('Trial coach account exists', coachRow.id)
  } else {
    fail('Trial coach account exists', 'coach profile or coaches row missing')
  }

  const clientProfile = await findProfileByEmail(DEMO_CLIENT_EMAIL)

  if (clientProfile?.id) {
    pass('Trial client account exists', clientProfile.id)
  } else {
    fail('Trial client account exists', 'profile not found')
  }

  if (clientProfile && hasClientEntitlement(clientProfile)) {
    pass('Trial client bypasses payment', clientProfile.access_source ?? 'payment_confirmed')
  } else {
    fail('Trial client bypasses payment', 'entitlement check failed')
  }

  if (clientProfile && clientProfile.access_source === 'admin_trial') {
    pass('Trial client access_source flag', 'admin_trial')
  } else if (clientProfile?.payment_confirmed) {
    pass('Trial client access_source flag', 'payment_confirmed (apply migration for access_source)')
  } else {
    fail('Trial client access_source flag', 'expected admin_trial or payment_confirmed')
  }

  const urls = getPortalLoginUrls()
  if (urls.admin.endsWith('/admin/login') && urls.coach.endsWith('/coach/login') && urls.client.endsWith('/login')) {
    pass('Login URLs resolve correctly')
  } else {
    fail('Login URLs resolve correctly', JSON.stringify(urls))
  }

  console.log('\n=== Summary ===')
  for (const key of Object.keys(results)) {
    console.log(`${key}: ${results[key]}`)
  }

  const allPass = Object.values(results).every((v) => v === 'PASS')
  if (!allPass) {
    console.log('\nRun: npx tsx --env-file=.env.local scripts/ensure-demo-accounts.ts')
  }
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
