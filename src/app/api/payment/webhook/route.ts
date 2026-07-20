import { NextResponse } from 'next/server'
import { recordCapturedPayment } from '@/lib/payments/fulfillment'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { getCoachingPlan, isValidPlanSlug } from '@/lib/payments/plans'
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  verifyRazorpayWebhookSignature,
} from '@/lib/payments/razorpay'

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
          notes?: Record<string, string>
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
  if (event !== 'payment.captured' && event !== 'order.paid') {
    return NextResponse.json({ success: true, ignored: true, event })
  }

  const entity = payload.payload?.payment?.entity
  const paymentId = entity?.id
  if (!paymentId) {
    return NextResponse.json({ success: false, error: 'Missing payment id' }, { status: 400 })
  }

  try {
    const payment = await fetchRazorpayPayment(paymentId)
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

    if (!email) {
      logPurchaseStep('webhook_missing_email', { paymentId })
      return NextResponse.json({ success: false, error: 'Missing customer email' }, { status: 422 })
    }

    const result = await recordCapturedPayment({
      email,
      name,
      plan,
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      amountPaise: payment.amount,
    })

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
