import 'server-only'
import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'
import { sendAccountSetupRecovery } from '@/lib/notifications/lifecycle'
import { issuePurchaseClaimToken } from '@/lib/payments/fulfillment'
import { createRazorpayRefund } from '@/lib/payments/razorpay'
import {
  computeRefundCheckinEligibility,
  type RefundCheckinEligibility,
} from '@/lib/payments/refund-eligibility'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Purchase } from '@/types/database'

type OperationType = 'refund' | 'cancel' | 'resend_setup' | 'retry_meta'

async function beginOperation(input: {
  purchaseId: string
  operationType: OperationType
  idempotencyKey: string
  performedBy: string
  reason: string
  amountPaise?: number
}): Promise<{ id: string; existingStatus?: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payment_operations')
    .insert({
      purchase_id: input.purchaseId,
      operation_type: input.operationType,
      idempotency_key: input.idempotencyKey,
      performed_by: input.performedBy,
      reason: input.reason,
      requested_amount_paise: input.amountPaise ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (!error && data) return { id: data.id as string }
  if (error?.code !== '23505') throw new Error(error?.message ?? 'Failed to create operation')

  const { data: existing } = await admin
    .from('payment_operations')
    .select('id, status')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (!existing) throw new Error('Operation idempotency lookup failed')
  return { id: existing.id as string, existingStatus: existing.status as string }
}

async function completeOperation(
  operationId: string,
  status: 'succeeded' | 'failed',
  values?: { refundId?: string; error?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('payment_operations')
    .update({
      status,
      razorpay_refund_id: values?.refundId ?? null,
      error_message: values?.error?.slice(0, 500) ?? null,
      metadata: values?.metadata ?? {},
      completed_at: new Date().toISOString(),
    })
    .eq('id', operationId)
}

async function loadPurchase(purchaseId: string): Promise<Purchase> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('purchases').select('*').eq('id', purchaseId).maybeSingle()
  if (error || !data) throw new Error(error?.message ?? 'Purchase not found')
  return data as Purchase
}

export async function getPurchaseRefundEligibility(
  purchaseId: string,
  evaluatedAt = new Date()
): Promise<RefundCheckinEligibility> {
  const purchase = await loadPurchase(purchaseId)
  if (!purchase.user_id) {
    return computeRefundCheckinEligibility({
      scheduleStartedAt: null,
      submissions: [],
      evaluatedAt,
    })
  }
  const admin = createAdminClient()
  const [{ data: profile }, { data: checkins, error }] = await Promise.all([
    admin
      .from('profiles')
      .select('checkin_schedule_started_at')
      .eq('id', purchase.user_id)
      .maybeSingle(),
    admin
      .from('checkins')
      .select('id, checkin_type, coaching_week, submitted_at, due_at')
      .eq('client_id', purchase.user_id),
  ])
  if (error) throw new Error(`Failed to calculate refund eligibility: ${error.message}`)

  return computeRefundCheckinEligibility({
    scheduleStartedAt: profile?.checkin_schedule_started_at ?? null,
    submissions: (checkins ?? []).map((row) => ({
      id: row.id,
      checkinType: row.checkin_type,
      coachingWeek: row.coaching_week,
      submittedAt: row.submitted_at,
      dueAt: row.due_at,
    })),
    evaluatedAt,
  })
}

async function revokeAccessIfNoOtherPurchase(userId: string | null, purchaseId: string): Promise<void> {
  if (!userId) return
  const admin = createAdminClient()
  const { count } = await admin
    .from('purchases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'captured')
    .eq('subscription_status', 'active')
    .neq('id', purchaseId)

  if ((count ?? 0) === 0) {
    await admin
      .from('profiles')
      .update({
        payment_confirmed: false,
        subscription_expires_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
  }
}

export async function refundPurchase(input: {
  purchaseId: string
  amountPaise: number
  performedBy: string
  reason: string
  idempotencyKey: string
  noResultClaimed: boolean
  evidenceSummary: string
}) {
  const purchase = await loadPurchase(input.purchaseId)
  if (purchase.status !== 'captured') throw new Error('Only captured payments can be refunded')
  const remaining = purchase.amount_paise - (purchase.refunded_amount_paise ?? 0)
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0 || input.amountPaise > remaining) {
    throw new Error('Refund amount exceeds the refundable balance')
  }

  const operation = await beginOperation({
    purchaseId: purchase.id,
    operationType: 'refund',
    idempotencyKey: input.idempotencyKey,
    performedBy: input.performedBy,
    reason: input.reason,
    amountPaise: input.amountPaise,
  })
  if (operation.existingStatus === 'succeeded') return { operationId: operation.id, duplicate: true }
  if (operation.existingStatus === 'pending') {
    throw new Error('This refund is pending reconciliation; it was not sent again')
  }

  const eligibility = await getPurchaseRefundEligibility(purchase.id)
  const admin = createAdminClient()
  await admin
    .from('payment_operations')
    .update({
      no_result_claimed: input.noResultClaimed,
      evidence_summary: input.evidenceSummary,
      eligibility_decision: eligibility.status,
      eligibility_due_count: eligibility.dueCount,
      eligibility_on_time_count: eligibility.onTimeCount,
      eligibility_open_window_count: eligibility.openWindowCount,
      eligibility_percentage: eligibility.percentage,
      eligibility_evaluated_at: eligibility.evaluatedAt,
      metadata: { eligibilityReason: eligibility.reason },
    })
    .eq('id', operation.id)

  if (!input.noResultClaimed || input.evidenceSummary.trim().length < 20) {
    await completeOperation(operation.id, 'failed', {
      error: 'A documented, admin-reviewed no-result claim is required',
      metadata: { eligibility },
    })
    throw new Error('Refund requires a documented, admin-reviewed no-result claim and evidence')
  }
  if (eligibility.status !== 'eligible') {
    await completeOperation(operation.id, 'failed', {
      error: eligibility.reason,
      metadata: { eligibility },
    })
    throw new Error(
      `Results-guarantee refund is not eligible: ${eligibility.onTimeCount}/${eligibility.dueCount} on time (${eligibility.percentage}%). ${eligibility.reason}`
    )
  }

  try {
    const refund = await createRazorpayRefund({
      paymentId: purchase.razorpay_payment_id,
      amountPaise: input.amountPaise,
      operationId: operation.id,
      reason: input.reason,
    })
    const refundedAmount = (purchase.refunded_amount_paise ?? 0) + refund.amount
    const fullyRefunded = refundedAmount >= purchase.amount_paise
    const now = new Date().toISOString()
    const { error } = await admin
      .from('purchases')
      .update({
        status: fullyRefunded ? 'refunded' : 'captured',
        refunded_amount_paise: refundedAmount,
        razorpay_refund_id: refund.id,
        refunded_at: now,
        subscription_status: fullyRefunded ? 'refunded' : purchase.subscription_status,
        subscription_cancelled_at: fullyRefunded ? now : purchase.subscription_cancelled_at,
      })
      .eq('id', purchase.id)
    if (error) throw new Error(`Refund succeeded but local update failed: ${error.message}`)

    if (fullyRefunded) await revokeAccessIfNoOtherPurchase(purchase.user_id, purchase.id)
    await completeOperation(operation.id, 'succeeded', {
      refundId: refund.id,
      metadata: { fullyRefunded, refundedAmountPaise: refundedAmount },
    })
    await admin.from('admin_audit_logs').insert({
      action: 'refund_purchase',
      target_user_id: purchase.user_id,
      target_role: purchase.user_id ? 'client' : null,
      performed_by: input.performedBy,
      reason: input.reason,
      metadata: {
        purchaseId: purchase.id,
        operationId: operation.id,
        amountPaise: input.amountPaise,
        refundId: refund.id,
        fullyRefunded,
        eligibility,
      },
    })
    return { operationId: operation.id, refundId: refund.id, fullyRefunded }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Refund failed'
    const knownRejected = /HTTP \d{3}/.test(message)
    if (knownRejected) await completeOperation(operation.id, 'failed', { error: message })
    throw new Error(
      knownRejected
        ? message
        : 'Refund outcome is uncertain. Reconcile in Razorpay before attempting another refund.'
    )
  }
}

export async function cancelPurchaseSubscription(input: {
  purchaseId: string
  performedBy: string
  reason: string
  idempotencyKey: string
}) {
  const purchase = await loadPurchase(input.purchaseId)
  if (purchase.status !== 'captured' || !purchase.user_id) {
    throw new Error('Only a claimed, captured purchase can have its subscription cancelled')
  }
  const operation = await beginOperation({
    purchaseId: purchase.id,
    operationType: 'cancel',
    idempotencyKey: input.idempotencyKey,
    performedBy: input.performedBy,
    reason: input.reason,
  })
  if (operation.existingStatus === 'succeeded') return { operationId: operation.id, duplicate: true }
  if (operation.existingStatus === 'pending') throw new Error('Cancellation is already pending')

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin
    .from('purchases')
    .update({ subscription_status: 'cancelled', subscription_cancelled_at: now })
    .eq('id', purchase.id)
  if (error) {
    await completeOperation(operation.id, 'failed', { error: error.message })
    throw new Error(error.message)
  }
  await revokeAccessIfNoOtherPurchase(purchase.user_id, purchase.id)
  await completeOperation(operation.id, 'succeeded')
  await admin.from('admin_audit_logs').insert({
    action: 'cancel_purchase_subscription',
    target_user_id: purchase.user_id,
    target_role: purchase.user_id ? 'client' : null,
    performed_by: input.performedBy,
    reason: input.reason,
    metadata: { purchaseId: purchase.id, operationId: operation.id },
  })
  return { operationId: operation.id }
}

export async function resendPurchaseSetup(input: {
  purchaseId: string
  performedBy: string
  reason: string
  idempotencyKey: string
}) {
  const purchase = await loadPurchase(input.purchaseId)
  if (purchase.claimed_at || purchase.user_id) throw new Error('Purchase has already been claimed')
  const operation = await beginOperation({
    purchaseId: purchase.id,
    operationType: 'resend_setup',
    idempotencyKey: input.idempotencyKey,
    performedBy: input.performedBy,
    reason: input.reason,
  })
  if (operation.existingStatus === 'succeeded') return { operationId: operation.id, duplicate: true }
  if (operation.existingStatus === 'pending') throw new Error('Setup resend is already pending')

  try {
    const token = await issuePurchaseClaimToken(purchase.id)
    const result = await sendAccountSetupRecovery({
      purchaseId: purchase.id,
      token,
      email: purchase.customer_email,
      phone: purchase.customer_phone,
      name: purchase.customer_name,
      stage: `manual_${operation.id}`,
    })
    if (result.failed > 0 && result.sent === 0) throw new Error('All configured delivery channels failed')
    await completeOperation(operation.id, 'succeeded', { metadata: result })
    const admin = createAdminClient()
    await admin.from('admin_audit_logs').insert({
      action: 'resend_purchase_setup',
      target_user_id: null,
      target_role: 'unclaimed_purchase',
      performed_by: input.performedBy,
      reason: input.reason,
      metadata: { purchaseId: purchase.id, operationId: operation.id, delivery: result },
    })
    return { operationId: operation.id, delivery: result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Setup resend failed'
    await completeOperation(operation.id, 'failed', { error: message })
    throw error
  }
}

export async function retryMetaPurchase(input: {
  purchaseId: string
  performedBy: string
  reason: string
  idempotencyKey: string
}) {
  const purchase = await loadPurchase(input.purchaseId)
  const operation = await beginOperation({
    purchaseId: purchase.id,
    operationType: 'retry_meta',
    idempotencyKey: input.idempotencyKey,
    performedBy: input.performedBy,
    reason: input.reason,
  })
  if (operation.existingStatus === 'succeeded') return { operationId: operation.id, duplicate: true }
  if (operation.existingStatus === 'pending') throw new Error('Meta retry is already pending')

  const result = await sendMetaPurchase({
    purchaseId: purchase.id,
    paymentId: purchase.razorpay_payment_id,
    email: purchase.customer_email,
    phone: purchase.customer_phone,
    amountPaise: purchase.amount_paise,
    currency: purchase.currency,
    planSlug: purchase.plan_slug,
  })
  await completeOperation(operation.id, result.ok ? 'succeeded' : 'failed', { error: result.error })
  if (!result.ok) throw new Error(result.error || 'Meta delivery failed')
  return { operationId: operation.id, result }
}
