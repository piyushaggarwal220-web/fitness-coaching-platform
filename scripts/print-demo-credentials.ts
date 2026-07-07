/**
 * Ensures demo accounts exist, resets passwords, verifies auth, prints credentials.
 * Run: npx tsx --env-file=.env.local scripts/print-demo-credentials.ts
 */
import { createClient } from '@supabase/supabase-js'
import {
  DEMO_ADMIN_EMAIL,
  DEMO_CLIENT_EMAIL,
  DEMO_COACH_EMAIL,
  ensureAllDemoAccounts,
  generateSecurePassword,
} from '../src/lib/admin/testing-accounts'
import { getPortalLoginUrls } from '../src/lib/admin/portal-urls'
import { hasClientEntitlement } from '../src/lib/entitlements'
import { hasAccessSourceColumn } from '../src/lib/db/profile-columns'
import { createAdminClient } from '../src/lib/supabase/admin'
import { isAdminRole } from '../src/lib/roles'

type DemoCredential = {
  label: string
  email: string
  password: string
  loginUrl: string
}

async function verifyAccount(input: {
  email: string
  password: string
  role: 'admin' | 'coach' | 'client'
  userId: string
}): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return 'Missing Supabase URL or anon key'

  const authClient = createClient(url, anonKey)
  const { data, error } = await authClient.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error) return `Login failed: ${error.message}`
  if (!data.user || data.user.id !== input.userId) return 'Login user id mismatch'

  const admin = createAdminClient()

  if (input.role === 'admin') {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', input.userId)
      .maybeSingle()
    if (!profile || !isAdminRole(profile.role)) {
      return 'Admin role verification failed'
    }
  }

  if (input.role === 'coach') {
    const { data: coach } = await admin
      .from('coaches')
      .select('id')
      .eq('user_id', input.userId)
      .maybeSingle()
    if (!coach?.id) return 'Coach record verification failed'
  }

  if (input.role === 'client') {
    const includeAccessSource = await hasAccessSourceColumn()
    const columns = includeAccessSource
      ? 'payment_confirmed, access_source'
      : 'payment_confirmed'
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select(columns)
      .eq('id', input.userId)
      .maybeSingle()
    if (profileError) return `Client profile lookup failed: ${profileError.message}`
    if (!hasClientEntitlement(profile)) return 'Client entitlement verification failed'
  }

  await authClient.auth.signOut()
  return null
}

async function ensureDemoClientEntitlement(userId: string): Promise<void> {
  const admin = createAdminClient()
  const includeAccessSource = await hasAccessSourceColumn()
  const payload: Record<string, unknown> = {
    payment_confirmed: true,
    role: 'client',
    updated_at: new Date().toISOString(),
  }
  if (includeAccessSource) {
    payload.access_source = 'admin_trial'
  }
  const { error } = await admin.from('profiles').update(payload).eq('id', userId)
  if (error) throw new Error(`Failed to restore client entitlement: ${error.message}`)
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required.')
    process.exit(1)
  }

  const accounts = await ensureAllDemoAccounts()
  const urls = getPortalLoginUrls()
  const admin = createAdminClient()

  const specs: Array<{
    label: string
    email: string
    role: 'admin' | 'coach' | 'client'
    loginUrl: string
  }> = [
    { label: 'ADMIN', email: DEMO_ADMIN_EMAIL, role: 'admin', loginUrl: urls.admin },
    { label: 'COACH', email: DEMO_COACH_EMAIL, role: 'coach', loginUrl: urls.coach },
    { label: 'CLIENT', email: DEMO_CLIENT_EMAIL, role: 'client', loginUrl: urls.client },
  ]

  const credentials: DemoCredential[] = []

  for (const spec of specs) {
    const account = accounts.find((row) => row.email === spec.email)
    if (!account?.userId) {
      console.error(`Demo account missing: ${spec.email}`)
      process.exit(1)
    }

    if (spec.role === 'client') {
      await ensureDemoClientEntitlement(account.userId)
    }

    const password = generateSecurePassword()
    const { error: updateError } = await admin.auth.admin.updateUserById(account.userId, {
      password,
    })
    if (updateError) {
      console.error(`Failed to reset password for ${spec.email}: ${updateError.message}`)
      process.exit(1)
    }

    const verifyError = await verifyAccount({
      email: spec.email,
      password,
      role: spec.role,
      userId: account.userId,
    })
    if (verifyError) {
      console.error(`Verification failed for ${spec.email}: ${verifyError}`)
      process.exit(1)
    }

    credentials.push({
      label: spec.label,
      email: spec.email,
      password,
      loginUrl: spec.loginUrl,
    })
  }

  console.log('----------')
  for (const cred of credentials) {
    console.log(cred.label)
    console.log(`Email: ${cred.email}`)
    console.log(`Password: ${cred.password}`)
    console.log(`Login URL: ${cred.loginUrl}`)
    console.log('')
  }
  console.log('----------')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
