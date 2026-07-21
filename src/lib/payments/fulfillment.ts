import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { autoAssignCoachToClient } from '@/lib/coach-assignment'
import { sendNotification, NotificationTemplates } from '@/lib/notifications/service'
import { findAuthUserIdByEmail } from '@/lib/payments/auth-user'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import type { CoachingPlan } from '@/lib/payments/plans'
import { getCoachingPlan } from '@/lib/payments/plans'
import type { Purchase } from '@/types/database'

const CLAIM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type RecordCapturedPaymentInput = {
  email: string
  name: string
  phone?: string | null
  termsPolicyVersion?: string | null
  refundPolicyVersion?: string | null
  policyAcknowledgedAt?: string | null
  policyAckIpHash?: string | null
  plan: CoachingPlan
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
}

export type RecordCapturedPaymentResult = {
  purchaseId: string
  claimToken: string | null
  alreadyClaimed: boolean
  customerEmail: string
  customerName: string | null
  planSlug: string
  razorpayPaymentId: string
}

export type ClaimPurchaseResult = {
  userId: string
  purchaseId: string
  isNewUser: boolean
  email: string
  /** Existing account — password was not overwritten; user may need /login */
  needsLogin?: boolean
}

export type ClaimPurchaseInput = {
  password: string
  name?: string
  token?: string
  email?: string
  paymentId?: string
}

/** @deprecated Prefer recordCapturedPayment + claimPurchaseWithPassword for checkout. */
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

function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function createClaimToken(): { raw: string; hash: string; expiresAt: string } {
  const raw = randomBytes(32).toString('hex')
  return {
    raw,
    hash: hashClaimToken(raw),
    expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS).toISOString(),
  }
}

/** Rotate an unclaimed purchase's setup token. Raw tokens are returned once and never persisted. */
export async function issuePurchaseClaimToken(purchaseId: string): Promise<string> {
  const admin = createAdminClient()
  const token = createClaimToken()
  const { data, error } = await admin
    .from('purchases')
    .update({
      claim_token_hash: token.hash,
      claim_token_expires_at: token.expiresAt,
    })
    .eq('id', purchaseId)
    .eq('status', 'captured')
    .is('claimed_at', null)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    throw new Error(error?.message ?? 'Purchase is not eligible for account setup')
  }
  return token.raw
}

function tokensEqual(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
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
    if (/breach|pwned|leaked|compromised/i.test(error.message)) {
      throw new Error('Please choose a different password and try again.')
    }
    throw new Error(`Failed to set account credentials: ${error.message}`)
  }
}

type PurchaseRow = Purchase & {
  claim_token_hash?: string | null
  claim_token_expires_at?: string | null
  claimed_at?: string | null
}

function isClaimed(purchase: PurchaseRow): boolean {
  return Boolean(purchase.claimed_at || purchase.user_id)
}

export async function recordCapturedPayment(
  input: RecordCapturedPaymentInput
): Promise<RecordCapturedPaymentResult> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()

  logPurchaseStep('payment_record_started', {
    email,
    paymentId: input.razorpayPaymentId,
    plan: input.plan.slug,
  })

  const { data: existing, error: lookupError } = await admin
    .from('purchases')
    .select('*')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Failed to look up purchase: ${lookupError.message}`)
  }

  const existingPurchase = existing as PurchaseRow | null

  if (existingPurchase && isClaimed(existingPurchase)) {
    logPurchaseStep('payment_already_claimed', {
      purchaseId: existingPurchase.id,
      email: existingPurchase.customer_email,
    })
    return {
      purchaseId: existingPurchase.id,
      claimToken: null,
      alreadyClaimed: true,
      customerEmail: existingPurchase.customer_email,
      customerName: existingPurchase.customer_name,
      planSlug: existingPurchase.plan_slug,
      razorpayPaymentId: existingPurchase.razorpay_payment_id,
    }
  }

  const tokenStillValid =
    Boolean(existingPurchase?.claim_token_hash) &&
    Boolean(existingPurchase?.claim_token_expires_at) &&
    new Date(existingPurchase!.claim_token_expires_at!).getTime() > Date.now()

  if (existingPurchase && tokenStillValid) {
    // Do not rotate tokens or rebind email — keeps the buyer's setup link working.
    const lockedEmail = existingPurchase.customer_email.trim().toLowerCase()
    if (email && lockedEmail && email !== lockedEmail) {
      logPurchaseStep('payment_recorded', {
        purchaseId: existingPurchase.id,
        emailMismatchIgnored: true,
      })
    }

    return {
      purchaseId: existingPurchase.id,
      claimToken: null,
      alreadyClaimed: false,
      customerEmail: existingPurchase.customer_email,
      customerName: existingPurchase.customer_name || name || null,
      planSlug: existingPurchase.plan_slug,
      razorpayPaymentId: existingPurchase.razorpay_payment_id,
    }
  }

  const token = createClaimToken()

  if (existingPurchase) {
    const lockedEmail = existingPurchase.customer_email.trim().toLowerCase()
    const nextEmail = lockedEmail || email
    const { data: updated, error: updateError } = await admin
      .from('purchases')
      .update({
        razorpay_order_id: input.razorpayOrderId || existingPurchase.razorpay_order_id,
        plan_slug: input.plan.slug,
        plan_name: input.plan.name,
        amount_paise: input.amountPaise,
        customer_email: nextEmail,
        customer_name: existingPurchase.customer_name || name || null,
        customer_phone: existingPurchase.customer_phone || input.phone || null,
        terms_policy_version: existingPurchase.terms_policy_version || input.termsPolicyVersion || null,
        refund_policy_version: existingPurchase.refund_policy_version || input.refundPolicyVersion || null,
        refund_policy_acknowledged_at:
          existingPurchase.refund_policy_acknowledged_at || input.policyAcknowledgedAt || null,
        policy_acknowledged_at:
          existingPurchase.policy_acknowledged_at || input.policyAcknowledgedAt || null,
        policy_ack_ip_hash: existingPurchase.policy_ack_ip_hash || input.policyAckIpHash || null,
        status: 'captured',
        claim_token_hash: token.hash,
        claim_token_expires_at: token.expiresAt,
        claimed_at: null,
        user_id: null,
      })
      .eq('id', existingPurchase.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? 'Failed to refresh purchase claim token')
    }

    logPurchaseStep('payment_recorded', {
      purchaseId: (updated as Purchase).id,
      refreshed: true,
    })

    return {
      purchaseId: (updated as Purchase).id,
      claimToken: token.raw,
      alreadyClaimed: false,
      customerEmail: (updated as Purchase).customer_email,
      customerName: (updated as Purchase).customer_name,
      planSlug: (updated as Purchase).plan_slug,
      razorpayPaymentId: (updated as Purchase).razorpay_payment_id,
    }
  }

  const { data: purchase, error: insertError } = await admin
    .from('purchases')
    .insert({
      user_id: null,
      razorpay_payment_id: input.razorpayPaymentId,
      razorpay_order_id: input.razorpayOrderId,
      plan_slug: input.plan.slug,
      plan_name: input.plan.name,
      amount_paise: input.amountPaise,
      currency: 'INR',
      status: 'captured',
      customer_email: email,
      customer_name: name || null,
      customer_phone: input.phone || null,
      terms_policy_version: input.termsPolicyVersion || null,
      refund_policy_version: input.refundPolicyVersion || null,
      refund_policy_acknowledged_at: input.policyAcknowledgedAt || null,
      policy_acknowledged_at: input.policyAcknowledgedAt || null,
      policy_ack_ip_hash: input.policyAckIpHash || null,
      claim_token_hash: token.hash,
      claim_token_expires_at: token.expiresAt,
      claimed_at: null,
    })
    .select('*')
    .single()

  if (insertError || !purchase) {
    // Race with webhook: load existing row once and return without recursive retry storm
    const { data: raced } = await admin
      .from('purchases')
      .select('*')
      .eq('razorpay_payment_id', input.razorpayPaymentId)
      .maybeSingle()

    if (raced) {
      const racedPurchase = raced as PurchaseRow
      if (isClaimed(racedPurchase)) {
        return {
          purchaseId: racedPurchase.id,
          claimToken: null,
          alreadyClaimed: true,
          customerEmail: racedPurchase.customer_email,
          customerName: racedPurchase.customer_name,
          planSlug: racedPurchase.plan_slug,
          razorpayPaymentId: racedPurchase.razorpay_payment_id,
        }
      }

      const racedTokenValid =
        Boolean(racedPurchase.claim_token_hash) &&
        Boolean(racedPurchase.claim_token_expires_at) &&
        new Date(racedPurchase.claim_token_expires_at!).getTime() > Date.now()

      if (racedTokenValid) {
        // Keep the original claim link alive after verify/webhook race.
        return {
          purchaseId: racedPurchase.id,
          claimToken: null,
          alreadyClaimed: false,
          customerEmail: racedPurchase.customer_email || email,
          customerName: racedPurchase.customer_name || name || null,
          planSlug: racedPurchase.plan_slug,
          razorpayPaymentId: racedPurchase.razorpay_payment_id,
        }
      }

      const refreshToken = createClaimToken()
      const { data: updated, error: updateError } = await admin
        .from('purchases')
        .update({
          claim_token_hash: refreshToken.hash,
          claim_token_expires_at: refreshToken.expiresAt,
          customer_email: racedPurchase.customer_email || email,
          customer_name: racedPurchase.customer_name || name || null,
        })
        .eq('id', racedPurchase.id)
        .select('*')
        .single()

      if (updateError || !updated) {
        throw new Error(updateError?.message ?? 'Failed to store purchase after race')
      }

      return {
        purchaseId: (updated as Purchase).id,
        claimToken: refreshToken.raw,
        alreadyClaimed: false,
        customerEmail: (updated as Purchase).customer_email,
        customerName: (updated as Purchase).customer_name,
        planSlug: (updated as Purchase).plan_slug,
        razorpayPaymentId: (updated as Purchase).razorpay_payment_id,
      }
    }

    logPurchaseStep('payment_record_failed', { email, error: insertError?.message ?? 'unknown' })
    throw new Error(insertError?.message ?? 'Failed to store purchase')
  }

  logPurchaseStep('payment_recorded', { purchaseId: (purchase as Purchase).id })

  return {
    purchaseId: (purchase as Purchase).id,
    claimToken: token.raw,
    alreadyClaimed: false,
    customerEmail: (purchase as Purchase).customer_email,
    customerName: (purchase as Purchase).customer_name,
    planSlug: (purchase as Purchase).plan_slug,
    razorpayPaymentId: (purchase as Purchase).razorpay_payment_id,
  }
}

export async function lookupClaimablePurchase(input: {
  token?: string
  email?: string
  paymentId?: string
}): Promise<{
  purchaseId: string
  customerEmail: string
  customerName: string | null
  planSlug: string
  planName: string
}> {
  const admin = createAdminClient()
  let purchase: PurchaseRow | null = null

  if (input.token?.trim()) {
    const hash = hashClaimToken(input.token.trim())
    const { data, error } = await admin
      .from('purchases')
      .select('*')
      .eq('claim_token_hash', hash)
      .maybeSingle()

    if (error) throw new Error(error.message)
    purchase = data as PurchaseRow | null

    if (!purchase) {
      throw new Error('This setup link is invalid or has already been used.')
    }

    if (
      purchase.claim_token_expires_at &&
      new Date(purchase.claim_token_expires_at).getTime() < Date.now()
    ) {
      throw new Error(
        'This setup link has expired. Use your email and Razorpay payment ID to finish creating your account.'
      )
    }
  } else {
    const email = input.email?.trim().toLowerCase()
    const paymentId = input.paymentId?.trim()
    if (!email || !paymentId) {
      throw new Error('Email and Razorpay payment ID are required')
    }

    const { data, error } = await admin
      .from('purchases')
      .select('*')
      .eq('razorpay_payment_id', paymentId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    purchase = data as PurchaseRow | null

    if (!purchase) {
      throw new Error('No payment found for that ID. Check your Razorpay receipt and try again.')
    }

    if (purchase.customer_email.trim().toLowerCase() !== email) {
      throw new Error('Email does not match this payment. Use the email you paid with.')
    }
  }

  if (!purchase) {
    throw new Error('Purchase not found')
  }

  if (isClaimed(purchase)) {
    throw new Error('This payment already has an account. Please sign in instead.')
  }

  return {
    purchaseId: purchase.id,
    customerEmail: purchase.customer_email,
    customerName: purchase.customer_name,
    planSlug: purchase.plan_slug,
    planName: purchase.plan_name,
  }
}

export async function claimPurchaseWithPassword(
  input: ClaimPurchaseInput
): Promise<ClaimPurchaseResult> {
  const admin = createAdminClient()
  const password = input.password

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters')
  }

  const lookup = await lookupClaimablePurchase({
    token: input.token,
    email: input.email,
    paymentId: input.paymentId,
  })

  const { data: purchaseRaw, error: purchaseError } = await admin
    .from('purchases')
    .select('*')
    .eq('id', lookup.purchaseId)
    .single()

  if (purchaseError || !purchaseRaw) {
    throw new Error(purchaseError?.message ?? 'Purchase not found')
  }

  const purchase = purchaseRaw as PurchaseRow
  const email = purchase.customer_email.trim().toLowerCase()
  const name = (input.name?.trim() || purchase.customer_name || '').trim()
  if (!name) {
    throw new Error('Name is required')
  }

  const plan = getCoachingPlan(purchase.plan_slug)
  if (!plan) {
    throw new Error('Purchase plan is invalid')
  }

  logPurchaseStep('claim_started', { email, purchaseId: purchase.id })

  let isNewUser = false
  let needsLogin = false
  let userId = await findAuthUserIdByEmail(admin, email)

  if (userId) {
    // Never overwrite an existing account password (prevents takeover).
    logPurchaseStep('auth_user_exists', { email, userId })
    needsLogin = true
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

  const now = new Date().toISOString()
  const includeAccessSource = await hasAccessSourceColumn()
  const planExpiry = new Date()
  planExpiry.setMonth(planExpiry.getMonth() + plan.durationMonths)

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('role, onboarding_complete, subscription_expires_at, name')
    .eq('id', userId)
    .maybeSingle()

  const existingRole = existingProfile?.role as string | null | undefined
  const preservePrivilegedRole = existingRole === 'coach' || existingRole === 'admin'
  const existingExpiry = existingProfile?.subscription_expires_at
    ? new Date(existingProfile.subscription_expires_at).getTime()
    : 0
  const nextExpiry = new Date(Math.max(planExpiry.getTime(), existingExpiry)).toISOString()

  const profilePayload: Record<string, unknown> = {
    id: userId,
    email,
    name: existingProfile?.name || name,
    payment_confirmed: true,
    subscription_expires_at: nextExpiry,
    updated_at: now,
  }

  if (!preservePrivilegedRole) {
    profilePayload.role = 'client'
  }

  if (isNewUser || existingProfile?.onboarding_complete == null) {
    profilePayload.onboarding_complete = false
  }

  if (includeAccessSource) {
    profilePayload.access_source = 'purchase'
  }

  const { error: profileError } = await admin.from('profiles').upsert(profilePayload)
  if (profileError) {
    logPurchaseStep('profile_create_failed', { userId, error: profileError.message })
    throw new Error(`Failed to create profile: ${profileError.message}`)
  }

  const { data: claimedRows, error: claimError } = await admin
    .from('purchases')
    .update({
      user_id: userId,
      customer_name: name,
      claimed_at: now,
      claim_token_hash: null,
      claim_token_expires_at: null,
    })
    .eq('id', purchase.id)
    .is('claimed_at', null)
    .select('id')

  if (claimError) {
    throw new Error(claimError.message || 'Failed to claim purchase')
  }

  if (!claimedRows?.length) {
    const { data: after } = await admin
      .from('purchases')
      .select('user_id, claimed_at')
      .eq('id', purchase.id)
      .maybeSingle()

    if (!after?.claimed_at || after.user_id !== userId) {
      throw new Error('This payment was already claimed. Please sign in.')
    }
  }

  const assignResult = await autoAssignCoachToClient(userId, admin)
  if (assignResult.coachId) {
    const { data: coach } = await admin
      .from('coaches')
      .select('name')
      .eq('id', assignResult.coachId)
      .maybeSingle()
    const welcome = NotificationTemplates.welcome()
    await sendNotification({ userId, ...welcome })
    if (coach?.name) {
      const assigned = NotificationTemplates.coachAssigned(coach.name)
      await sendNotification({ userId, ...assigned })
    }
  } else {
    const welcome = NotificationTemplates.welcome()
    await sendNotification({ userId, ...welcome })
  }

  logPurchaseStep('claim_complete', { userId, purchaseId: purchase.id, isNewUser, needsLogin })

  return { userId, purchaseId: purchase.id, isNewUser, email, needsLogin }
}

/** Combined path for redemption codes / scripts that still provide a password up front. */
export async function fulfillPurchase(input: FulfillPurchaseInput): Promise<FulfillPurchaseResult> {
  const recorded = await recordCapturedPayment({
    email: input.email,
    name: input.name,
    plan: input.plan,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpayOrderId: input.razorpayOrderId,
    amountPaise: input.amountPaise,
  })

  if (recorded.alreadyClaimed) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('purchases')
      .select('user_id')
      .eq('id', recorded.purchaseId)
      .maybeSingle()

    if (!data?.user_id) {
      throw new Error('Purchase is marked claimed but has no user')
    }

    return {
      userId: data.user_id,
      purchaseId: recorded.purchaseId,
      isNewUser: false,
    }
  }

  if (!recorded.claimToken) {
    // Token already issued (webhook/verify race) — claim via email + payment id.
    const claimed = await claimPurchaseWithPassword({
      email: recorded.customerEmail,
      paymentId: recorded.razorpayPaymentId,
      password: input.password,
      name: input.name,
    })
    return {
      userId: claimed.userId,
      purchaseId: claimed.purchaseId,
      isNewUser: claimed.isNewUser,
    }
  }

  const claimed = await claimPurchaseWithPassword({
    token: recorded.claimToken,
    password: input.password,
    name: input.name,
  })

  return {
    userId: claimed.userId,
    purchaseId: claimed.purchaseId,
    isNewUser: claimed.isNewUser,
  }
}

export function verifyStoredClaimToken(rawToken: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false
  return tokensEqual(hashClaimToken(rawToken), storedHash)
}
