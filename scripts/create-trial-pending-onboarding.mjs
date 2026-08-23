/**
 * Create a payment-bypassed client with 6 months access and onboarding pending.
 * Run: node --env-file=.env.local scripts/create-trial-pending-onboarding.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function password(length = 14) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

const stamp = Date.now().toString(36)
const email = `trial.pending.${stamp}@lurvox.test`
const pass = password()
const name = 'Trial Pending Onboarding'
const coachId = 'c0e44f5c-28c6-4a93-8a2f-d7ed69172b2a'

const expires = new Date()
expires.setMonth(expires.getMonth() + 6)

const { data: authData, error: authError } = await admin.auth.admin.createUser({
  email,
  password: pass,
  email_confirm: true,
  user_metadata: { name, role: 'client' },
})

if (authError || !authData.user) {
  console.error(authError?.message ?? 'Failed to create auth user')
  process.exit(1)
}

const userId = authData.user.id
const now = new Date().toISOString()

const { error: profileError } = await admin.from('profiles').upsert({
  id: userId,
  email,
  name,
  role: 'client',
  payment_confirmed: true,
  access_source: 'admin_trial',
  onboarding_complete: false,
  onboarding_completed_at: null,
  plan_delivered: false,
  coach_id: coachId,
  subscription_expires_at: expires.toISOString(),
  updated_at: now,
})

if (profileError) {
  console.error('Profile upsert failed:', profileError.message)
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      email,
      password: pass,
      userId,
      coachId,
      paymentConfirmed: true,
      accessSource: 'admin_trial',
      onboardingComplete: false,
      subscriptionExpiresAt: expires.toISOString(),
      loginUrl: 'https://app.lurvox.in/login',
    },
    null,
    2
  )
)
