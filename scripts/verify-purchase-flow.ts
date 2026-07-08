/**
 * Verifies purchase → account creation → sign-in for new and existing emails.
 * Run: npm run verify:purchase-flow
 */
import { createClient } from '@supabase/supabase-js'
import { fulfillPurchase } from '../src/lib/payments/fulfillment'
import { findAuthUserIdByEmail } from '../src/lib/payments/auth-user'
import { COACHING_PLANS } from '../src/lib/payments/plans'
import { createAdminClient } from '../src/lib/supabase/admin'

const results: Record<string, 'PASS' | 'FAIL'> = {}

function pass(name: string) {
  results[name] = 'PASS'
  console.log(`✓ ${name}`)
}

function fail(name: string, detail: string) {
  results[name] = 'FAIL'
  console.log(`✗ ${name}: ${detail}`)
}

function testPassword() {
  return `TestPass_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}!`
}

async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Missing Supabase env vars')

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  return !error
}

async function cleanupUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  await admin.from('purchases').delete().eq('user_id', userId)
  await admin.from('profiles').delete().eq('id', userId)
  await admin.auth.admin.deleteUser(userId)
}

async function main() {
  const admin = createAdminClient()
  const plan = COACHING_PLANS['6_months']
  const ts = Date.now()

  // 1. New email — full fulfillment + sign-in
  const newEmail = `purchase-new-${ts}@example.com`
  const newPassword = testPassword()
  try {
    const result = await fulfillPurchase({
      email: newEmail,
      password: newPassword,
      name: 'Purchase Flow New',
      plan,
      razorpayPaymentId: `verify_new_pay_${ts}`,
      razorpayOrderId: `verify_new_order_${ts}`,
      amountPaise: plan.amountPaise,
    })

    const authId = await findAuthUserIdByEmail(admin, newEmail)
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, payment_confirmed, role')
      .eq('id', result.userId)
      .single()

    if (authId === result.userId && profile?.payment_confirmed && profile.role === 'client') {
      pass('New email: auth + profile created')
    } else {
      fail('New email: auth + profile created', JSON.stringify({ authId, profile }))
    }

    if (await signInWithPassword(newEmail, newPassword)) {
      pass('New email: sign-in with checkout password')
    } else {
      fail('New email: sign-in with checkout password', 'invalid credentials')
    }

    await cleanupUser(admin, result.userId)
  } catch (err) {
    fail('New email flow', err instanceof Error ? err.message : String(err))
  }

  // 2. Existing email with different password — must sync password on purchase
  const existingEmail = `purchase-existing-${ts}@example.com`
  const oldPassword = testPassword()
  const checkoutPassword = testPassword()
  let existingUserId: string | null = null

  try {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: existingEmail,
      password: oldPassword,
      email_confirm: true,
      user_metadata: { name: 'Existing User' },
    })
    if (error || !created.user) throw new Error(error?.message ?? 'setup failed')
    existingUserId = created.user.id

    await admin.from('profiles').upsert({
      id: existingUserId,
      email: existingEmail,
      name: 'Existing User',
      role: 'client',
      payment_confirmed: false,
      onboarding_complete: false,
      updated_at: new Date().toISOString(),
    })

    if (await signInWithPassword(existingEmail, oldPassword)) {
      pass('Existing email: original password works before purchase')
    } else {
      fail('Existing email: original password works before purchase', 'setup invalid')
    }

    await fulfillPurchase({
      email: existingEmail,
      password: checkoutPassword,
      name: 'Existing User',
      plan,
      razorpayPaymentId: `verify_existing_pay_${ts}`,
      razorpayOrderId: `verify_existing_order_${ts}`,
      amountPaise: plan.amountPaise,
    })

    if (await signInWithPassword(existingEmail, checkoutPassword)) {
      pass('Existing email: sign-in with checkout password after purchase')
    } else {
      fail('Existing email: sign-in with checkout password after purchase', 'password not synced')
    }

    // Allow auth password propagation before checking invalidation of the old password.
    await new Promise((resolve) => setTimeout(resolve, 1500))

    if (!(await signInWithPassword(existingEmail, oldPassword))) {
      pass('Existing email: old password no longer works after purchase')
    } else {
      fail('Existing email: old password no longer works after purchase', 'old password still valid')
    }

    const { data: entitled } = await admin
      .from('profiles')
      .select('payment_confirmed')
      .eq('id', existingUserId)
      .single()

    if (entitled?.payment_confirmed) {
      pass('Existing email: entitlement granted')
    } else {
      fail('Existing email: entitlement granted', 'payment_confirmed false')
    }

    await cleanupUser(admin, existingUserId)
  } catch (err) {
    if (existingUserId) await cleanupUser(admin, existingUserId).catch(() => {})
    fail('Existing email flow', err instanceof Error ? err.message : String(err))
  }

  // 3. Idempotent payment id — retry must still allow sign-in
  const retryEmail = `purchase-retry-${ts}@example.com`
  const retryPassword = testPassword()
  const paymentId = `verify_retry_pay_${ts}`

  try {
    const first = await fulfillPurchase({
      email: retryEmail,
      password: retryPassword,
      name: 'Retry User',
      plan,
      razorpayPaymentId: paymentId,
      razorpayOrderId: `verify_retry_order_${ts}`,
      amountPaise: plan.amountPaise,
    })

    const second = await fulfillPurchase({
      email: retryEmail,
      password: retryPassword,
      name: 'Retry User',
      plan,
      razorpayPaymentId: paymentId,
      razorpayOrderId: `verify_retry_order_${ts}`,
      amountPaise: plan.amountPaise,
    })

    if (first.purchaseId === second.purchaseId && first.userId === second.userId) {
      pass('Idempotent payment: same purchase returned')
    } else {
      fail('Idempotent payment: same purchase returned', JSON.stringify({ first, second }))
    }

    if (await signInWithPassword(retryEmail, retryPassword)) {
      pass('Idempotent payment: sign-in still works')
    } else {
      fail('Idempotent payment: sign-in still works', 'invalid credentials')
    }

    await cleanupUser(admin, first.userId)
  } catch (err) {
    fail('Idempotent payment flow', err instanceof Error ? err.message : String(err))
  }

  // 4. Password is not trimmed — must match exactly
  const trimEmail = `purchase-trim-${ts}@example.com`
  const trimPassword = `  pass${ts}  `
  try {
    const result = await fulfillPurchase({
      email: trimEmail,
      password: trimPassword,
      name: 'Trim Test',
      plan,
      razorpayPaymentId: `verify_trim_pay_${ts}`,
      razorpayOrderId: `verify_trim_order_${ts}`,
      amountPaise: plan.amountPaise,
    })

    if (await signInWithPassword(trimEmail, trimPassword)) {
      pass('Password not altered: sign-in with exact checkout password')
    } else {
      fail('Password not altered: sign-in with exact checkout password', 'credentials mismatch')
    }

    await cleanupUser(admin, result.userId)
  } catch (err) {
    fail('Password trim flow', err instanceof Error ? err.message : String(err))
  }

  console.log('\n=== Summary ===')
  for (const [key, value] of Object.entries(results)) {
    console.log(`${key}: ${value}`)
  }

  const allPass = Object.values(results).every((v) => v === 'PASS')
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
