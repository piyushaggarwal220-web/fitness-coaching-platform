import assert from 'node:assert/strict'
import {
  consultationBlockedByExistingPlan,
  emailsMatch,
  phoneLast10,
  phonesMatch,
  type ExistingPlanProfile,
  type ExistingPlanPurchase,
} from '../src/lib/talk-to-coach-existing-plan'

const NOW = Date.parse('2026-10-22T12:00:00.000Z')
const FUTURE = '2027-01-01T00:00:00.000Z'
const LONG_EXPIRED = '2026-01-01T00:00:00.000Z'

function profile(overrides: Partial<ExistingPlanProfile> = {}): ExistingPlanProfile {
  return {
    id: 'client-1',
    email: 'client@example.com',
    phone: '+919876543210',
    role: 'client',
    payment_confirmed: true,
    access_source: 'purchase',
    subscription_expires_at: FUTURE,
    ...overrides,
  }
}

function purchase(overrides: Partial<ExistingPlanPurchase> = {}): ExistingPlanPurchase {
  return {
    id: 'purchase-1',
    user_id: 'client-1',
    plan_slug: '3_months',
    status: 'captured',
    subscription_status: 'active',
    customer_email: 'client@example.com',
    customer_phone: '+919876543210',
    ...overrides,
  }
}

function blocked(input: {
  phone?: string
  email?: string | null
  profiles?: ExistingPlanProfile[]
  purchases?: ExistingPlanPurchase[]
  linkedProfiles?: ExistingPlanProfile[]
}): boolean {
  return consultationBlockedByExistingPlan({
    phone: input.phone ?? '9876543210',
    email: input.email ?? null,
    profiles: input.profiles ?? [],
    purchases: input.purchases ?? [],
    linkedProfiles: input.linkedProfiles ?? [],
    now: NOW,
  })
}

assert.equal(phoneLast10('+91 98765 43210'), '9876543210')
assert.equal(phoneLast10('98765-43210'), '9876543210')
assert.equal(phonesMatch('9876543210', '+91 98765 43210'), true)
assert.equal(phonesMatch('9876543210', '9123456780'), false)
assert.equal(emailsMatch('A@Example.com', 'a@example.com'), true)
assert.equal(emailsMatch('', 'a@example.com'), false)

assert.equal(blocked({ profiles: [profile({ access_source: 'purchase' })] }), true, '3-month style purchase access')
assert.equal(
  blocked({ profiles: [profile({ access_source: 'enrollment_code' })] }),
  true,
  'enrollment plan'
)
assert.equal(
  blocked({
    profiles: [profile({ access_source: 'admin_trial', payment_confirmed: true, subscription_expires_at: null })],
  }),
  true,
  'admin trial'
)
assert.equal(
  blocked({
    profiles: [profile()],
    purchases: [purchase({ plan_slug: '12_months' })],
  }),
  true,
  '12 month'
)
assert.equal(
  blocked({
    profiles: [profile()],
    purchases: [purchase({ plan_slug: '1_week_trial' })],
  }),
  true,
  'trial'
)
assert.equal(
  blocked({
    profiles: [profile()],
    purchases: [purchase({ plan_slug: 'digital_complete' })],
  }),
  true,
  'digital plan'
)
assert.equal(
  blocked({
    profiles: [profile()],
    purchases: [purchase({ plan_slug: '1_month' })],
  }),
  true,
  'legacy 1 month'
)
assert.equal(
  blocked({
    profiles: [profile({ payment_confirmed: false, subscription_expires_at: LONG_EXPIRED })],
    purchases: [purchase({ user_id: 'client-1' })],
    linkedProfiles: [profile({ payment_confirmed: false, subscription_expires_at: LONG_EXPIRED })],
  }),
  false,
  'ended plan can book'
)
assert.equal(
  blocked({
    purchases: [purchase({ user_id: null, plan_slug: '6_months', customer_phone: '98765 43210' })],
  }),
  true,
  'unclaimed paid plan'
)
assert.equal(
  blocked({
    purchases: [purchase({ user_id: null, plan_slug: 'exercise_library' })],
  }),
  false,
  'exercise library add-on is not a plan'
)
assert.equal(
  blocked({
    phone: '9000000001',
    profiles: [profile()],
  }),
  false,
  'different phone'
)
assert.equal(
  blocked({
    phone: '9000000001',
    email: 'client@example.com',
    profiles: [profile({ phone: '+919111111111' })],
  }),
  true,
  'same email'
)
assert.equal(
  blocked({
    profiles: [profile({ role: 'coach', payment_confirmed: false, access_source: null, subscription_expires_at: null })],
  }),
  false,
  'coach account'
)

console.log('OK: consultation booking blocks every active plan type')

async function verifyLiveLookup() {
  const { createAdminClient } = await import('../src/lib/supabase/admin')
  const { existingPlanBlocksConsultation } = await import('../src/lib/talk-to-coach-existing-plan')

  const admin = createAdminClient()
  const { data: active, error: activeError } = await admin
    .from('profiles')
    .select('phone')
    .eq('payment_confirmed', true)
    .not('phone', 'is', null)
    .limit(1)
    .maybeSingle()

  if (activeError) throw new Error(activeError.message)
  if (!active?.phone) throw new Error('No active client phone to check')

  const activeCheck = await existingPlanBlocksConsultation(admin, { phone: String(active.phone) })
  assert.equal(activeCheck.ok, true)
  assert.equal(activeCheck.ok && activeCheck.blocked, true, 'live active client is blocked')

  const { data: spaced, error: spacedError } = await admin
    .from('profiles')
    .select('phone')
    .eq('payment_confirmed', true)
    .like('phone', '% %')
    .limit(1)
    .maybeSingle()

  if (spacedError) throw new Error(spacedError.message)
  if (spaced?.phone) {
    const compact = String(spaced.phone).replace(/\D/g, '')
    const spacedCheck = await existingPlanBlocksConsultation(admin, { phone: compact })
    assert.equal(spacedCheck.ok, true)
    assert.equal(spacedCheck.ok && spacedCheck.blocked, true, 'spaced stored phone matches compact input')
  }

  let strangerBlocked = true
  for (let i = 0; i < 5 && strangerBlocked; i += 1) {
    const stranger = `6${String(100000000 + i).slice(0, 9)}`
    const strangerCheck = await existingPlanBlocksConsultation(admin, { phone: stranger })
    assert.equal(strangerCheck.ok, true, strangerCheck.ok ? '' : strangerCheck.error)
    strangerBlocked = strangerCheck.ok ? strangerCheck.blocked : true
  }
  assert.equal(strangerBlocked, false, 'an unused phone can still book')

  const endedBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: ended, error: endedError } = await admin
    .from('profiles')
    .select('phone')
    .eq('payment_confirmed', false)
    .in('access_source', ['purchase', 'enrollment_code'])
    .lt('subscription_expires_at', endedBefore)
    .not('phone', 'is', null)
    .limit(8)

  if (endedError) throw new Error(endedError.message)
  let endedAllowed = 0
  for (const row of ended ?? []) {
    if (!row.phone) continue
    const endedCheck = await existingPlanBlocksConsultation(admin, { phone: String(row.phone) })
    assert.equal(endedCheck.ok, true)
    if (endedCheck.ok && !endedCheck.blocked) endedAllowed += 1
  }
  assert.ok(endedAllowed > 0, 'an ended membership can still book a call')

  console.log('OK: live lookup blocks active plans and allows an ended membership')
}

if (process.argv.includes('--live')) {
  verifyLiveLookup().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
