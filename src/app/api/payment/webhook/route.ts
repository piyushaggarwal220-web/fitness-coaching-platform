import { NextResponse } from 'next/server'
import { recordCapturedPayment } from '@/lib/payments/fulfillment'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { getCoachingPlan, isValidPlanSlug } from '@/lib/payments/plans'
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  verifyRazorpayWebhookSignature,
} from '@/lib/payments/razorpay'
import { sendAccountSetupRecovery } from '@/lib/notifications/lifecycle'
import { sendMetaPurchase } from '@/lib/analytics/meta-conversions'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Razorpay webhook — records captured payments when the browser never reaches /verify.
 *
 * Dashboard setup:
 * 1. Razorpay → Settings → Webhooks
 * 2. URL: https://app.lurvox.in/api/payment/webhook
 * 3. Event: payment.captured
 * 4. Copy signing secret into env RAZORPAY_WEBHOOK_SECRET
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ success: false, error: 'Invalid webhook signature' }, { status: 400 })
  }

  let payload: {
    event?: string
    payload?: {
      payment?: {
        entity?: {
          id?: string
          status?: string
          amount?: number
          order_id?: string
          email?: string
          contact?: string
          error_code?: string
          error_description?: string
          notes?: Record<string, string>
        }
      }
      refund?: {
        entity?: {
          id?: string
          payment_id?: string
          amount?: number
          status?: string
        }
      }
    }
  }

  try {
    payload = JSON.parse(rawBody) as typeof payload
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload.event ?? ''
  if (
    event !== 'payment.captured' &&
    event !== 'order.paid' &&
    event !== 'payment.failed' &&
    event !== 'refund.processed' &&
    event !== 'payment.refunded'
  ) {
    return NextResponse.json({ success: true, ignored: true, event })
  }

  if (event === 'refund.processed' || event === 'payment.refunded') {
    const refund = payload.payload?.refund?.entity
    const refundedPaymentId = refund?.payment_id ?? payload.payload?.payment?.entity?.id
    if (!refundedPaymentId) {
      return NextResponse.json({ success: false, error: 'Missing refunded payment id' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data: purchase } = await admin
      .from('purchases')
      .select('id, user_id, amount_paise, refunded_amount_paise')
      .eq('razorpay_payment_id', refundedPaymentId)
      .maybeSingle()
    if (!purchase) return NextResponse.json({ success: true, ignored: true, reason: 'purchase_not_found' })

    const refundedAmount = Math.min(
      purchase.amount_paise,
      Math.max(purchase.refunded_amount_paise ?? 0, refund?.amount ?? purchase.amount_paise)
    )
    await admin
      .from('purchases')
      .update({
        status: refundedAmount >= purchase.amount_paise ? 'refunded' : 'captured',
        refunded_amount_paise: refundedAmount,
        razorpay_refund_id: refund?.id ?? null,
        refunded_at: new Date().toISOString(),
        subscription_status: refundedAmount >= purchase.amount_paise ? 'refunded' : 'active',
        subscription_cancelled_at:
          refundedAmount >= purchase.amount_paise ? new Date().toISOString() : null,
      })
      .eq('id', purchase.id)
    if (refundedAmount >= purchase.amount_paise && purchase.user_id) {
      const { count } = await admin
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', purchase.user_id)
        .eq('status', 'captured')
        .eq('subscription_status', 'active')
        .neq('id', purchase.id)
      if ((count ?? 0) === 0) {
        await admin
          .from('profiles')
          .update({
            payment_confirmed: false,
            subscription_expires_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', purchase.user_id)
      }
    }
    await admin.from('admin_audit_logs').insert({
      action: 'razorpay_refund_webhook',
      target_user_id: purchase.user_id,
      target_role: purchase.user_id ? 'client' : null,
      performed_by: null,
      reason: 'Verified Razorpay refund webhook',
      metadata: {
        purchaseId: purchase.id,
        refundId: refund?.id ?? null,
        refundedAmountPaise: refundedAmount,
      },
    })
    return NextResponse.json({ success: true, purchaseId: purchase.id })
  }

  const entity = payload.payload?.payment?.entity
  const paymentId = entity?.id
  if (!paymentId) {
    return NextResponse.json({ success: false, error: 'Missing payment id' }, { status: 400 })
  }

  try {
    const payment = await fetchRazorpayPayment(paymentId)
    if (event === 'payment.failed') {
      if (payment.status === 'captured' || payment.status === 'authorized') {
        return NextResponse.json({ success: true, ignored: true, reason: 'stale_failed_event' })
      }
      let failedNotes: Record<string, string> = {
        ...(payment.notes ?? {}),
        ...(entity?.notes ?? {}),
      }
      if (payment.order_id) {
        try {
          const order = await fetchRazorpayOrder(payment.order_id)
          failedNotes = { ...(order.notes ?? {}), ...failedNotes }
        } catch {
          // Payment notes remain authoritative when order lookup is unavailable.
        }
      }
      const failedPlan = getCoachingPlan(failedNotes.plan_slug)
      const failedEmail = (failedNotes.customer_email || payment.email || '').trim().toLowerCase()
      if (!failedPlan || !failedEmail) {
        return NextResponse.json({ success: true, ignored: true, reason: 'incomplete_failed_payment' })
      }
      const admin = createAdminClient()
      const { error } = await admin.from('purchases').upsert(
        {
          razorpay_payment_id: payment.id,
          razorpay_order_id: payment.order_id,
          plan_slug: failedPlan.slug,
          plan_name: failedPlan.name,
          amount_paise: payment.amount,
          currency: payment.currency || 'INR',
          status: 'failed',
          customer_email: failedEmail,
          customer_name: failedNotes.customer_name || null,
          customer_phone: failedNotes.customer_phone || payment.contact || null,
          refund_policy_version: failedNotes.refund_policy_version || null,
          refund_policy_acknowledged_at: failedNotes.refund_policy_acknowledged_at || null,
          failure_code: entity?.error_code || null,
          failure_description: entity?.error_description?.slice(0, 500) || null,
        },
        { onConflict: 'razorpay_payment_id' }
      )
      if (error) throw new Error(error.message)
      return NextResponse.json({ success: true, status: 'failed' })
    }

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return NextResponse.json({ success: true, ignored: true, status: payment.status })
    }

    let notes: Record<string, string> = {
      ...(payment.notes ?? {}),
      ...(entity?.notes ?? {}),
    }

    if (payment.order_id) {
      try {
        const order = await fetchRazorpayOrder(payment.order_id)
        notes = { ...(order.notes ?? {}), ...notes }
      } catch {
        // Notes on payment alone may be enough
      }
    }

    const planSlug = notes.plan_slug
    if (!planSlug || !isValidPlanSlug(planSlug)) {
      logPurchaseStep('webhook_missing_plan', { paymentId, notes })
      return NextResponse.json({ success: false, error: 'Missing plan on payment notes' }, { status: 422 })
    }

    const plan = getCoachingPlan(planSlug)
    if (!plan) {
      return NextResponse.json({ success: false, error: 'Invalid plan' }, { status: 422 })
    }

    if (payment.amount !== plan.amountPaise) {
      logPurchaseStep('webhook_amount_mismatch', {
        paymentId,
        expected: plan.amountPaise,
        actual: payment.amount,
      })
      return NextResponse.json({ success: false, error: 'Amount mismatch' }, { status: 422 })
    }

    const email = (notes.customer_email || payment.email || '').trim().toLowerCase()
    const name = (notes.customer_name || '').trim() || 'Customer'
    const phone = (notes.customer_phone || payment.contact || '').trim() || null

    if (!email) {
      logPurchaseStep('webhook_missing_email', { paymentId })
      return NextResponse.json({ success: false, error: 'Missing customer email' }, { status: 422 })
    }

    const result = await recordCapturedPayment({
      email,
      name,
      phone,
      refundPolicyVersion: notes.refund_policy_version || null,
      refundPolicyAcknowledgedAt: notes.refund_policy_acknowledged_at || null,
      plan,
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      amountPaise: payment.amount,
    })

    await Promise.allSettled([
      sendMetaPurchase({
        purchaseId: result.purchaseId,
        paymentId: result.razorpayPaymentId,
        email: result.customerEmail,
        phone,
        amountPaise: payment.amount,
        currency: payment.currency || 'INR',
        planSlug: plan.slug,
      }),
      result.claimToken
        ? sendAccountSetupRecovery({
            purchaseId: result.purchaseId,
            token: result.claimToken,
            email: result.customerEmail,
            phone,
            name: result.customerName,
            stage: 'confirmed',
          })
        : Promise.resolve({ sent: 0, skipped: 1, failed: 0 }),
    ])

    logPurchaseStep('webhook_recorded', {
      paymentId,
      purchaseId: result.purchaseId,
      alreadyClaimed: result.alreadyClaimed,
    })

    return NextResponse.json({
      success: true,
      purchaseId: result.purchaseId,
      alreadyClaimed: result.alreadyClaimed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed'
    logPurchaseStep('webhook_failed', { paymentId, error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
