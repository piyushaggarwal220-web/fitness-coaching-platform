import { findAuthUserIdByEmail } from '@/lib/payments/auth-user'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import type { CoachingPlan } from '@/lib/payments/plans'
import type { Purchase } from '@/types/database'

export type FulfillPurchaseInput = {
  email: string
  password: string
  name: string
  plan: CoachingPlan
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
}

export type FulfillPurchaseResult = {
  userId: string
  purchaseId: string
  isNewUser: boolean
}

async function syncAuthCredentials(
  userId: string,
  email: string,
  password: string,
  name: string
): Promise<void> {
  const admin = createAdminClient()

  logPurchaseStep('password_sync', { userId, email })

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (error) {
    logPurchaseStep('password_sync_failed', { userId, error: error.message })
    throw new Error(`Failed to set account credentials: ${error.message}`)
  }
}

export async function fulfillPurchase(input: FulfillPurchaseInput): Promise<FulfillPurchaseResult> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const password = input.password
  const name = input.name.trim()

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters')
  }

  logPurchaseStep('fulfillment_started', { email })

  const { data: existingPurchase } = await admin
    .from('purchases')
    .select('id, user_id')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle()

  let userId = existingPurchase?.user_id ?? null
  let isNewUser = false

  if (!userId) {
    const existingAuthUserId = await findAuthUserIdByEmail(admin, email)

    if (existingAuthUserId) {
      userId = existingAuthUserId
      logPurchaseStep('auth_user_exists', { email, userId })
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      })

      if (createError || !created.user) {
        logPurchaseStep('auth_user_create_failed', {
          email,
          error: createError?.message ?? 'unknown',
        })
        throw new Error(createError?.message ?? 'Failed to create customer account')
      }

      userId = created.user.id
      isNewUser = true
      logPurchaseStep('auth_user_created', { email, userId })
    }
  }

  await syncAuthCredentials(userId, email, password, name)

  const now = new Date().toISOString()
  const includeAccessSource = await hasAccessSourceColumn()

  const profilePayload: Record<string, unknown> = {
    id: userId,
    email,
    name,
    role: 'client',
    payment_confirmed: true,
    onboarding_complete: false,
    updated_at: now,
  }

  if (includeAccessSource) {
    profilePayload.access_source = 'purchase'
  }

  const { error: profileError } = await admin.from('profiles').upsert(profilePayload)

  if (profileError) {
    logPurchaseStep('profile_create_failed', { userId, error: profileError.message })
    throw new Error(`Failed to create profile: ${profileError.message}`)
  }

  logPurchaseStep('profile_created', { userId, email })
  logPurchaseStep('entitlement_granted', { userId, payment_confirmed: true })

  let purchaseId = existingPurchase?.id

  if (!purchaseId) {
    const { data: purchase, error: purchaseError } = await admin
      .from('purchases')
      .insert({
        user_id: userId,
        razorpay_payment_id: input.razorpayPaymentId,
        razorpay_order_id: input.razorpayOrderId,
        plan_slug: input.plan.slug,
        plan_name: input.plan.name,
        amount_paise: input.amountPaise,
        currency: 'INR',
        status: 'captured',
        customer_email: email,
        customer_name: name,
      })
      .select()
      .single()

    if (purchaseError || !purchase) {
      logPurchaseStep('fulfillment_failed', {
        userId,
        step: 'purchase_insert',
        error: purchaseError?.message ?? 'unknown',
      })
      throw new Error(purchaseError?.message ?? 'Failed to store purchase')
    }

    purchaseId = (purchase as Purchase).id
    logPurchaseStep('purchase_recorded', { userId, purchaseId })
  }

  logPurchaseStep('fulfillment_complete', { userId, purchaseId, isNewUser })

  return { userId, purchaseId, isNewUser }
}
