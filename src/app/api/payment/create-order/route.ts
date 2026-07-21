import { NextResponse } from 'next/server'
import { getCoachingPlan } from '@/lib/payments/plans'
import { shouldBypassPayment } from '@/lib/config'
import { createRazorpayOrder, getRazorpayKeyId } from '@/lib/payments/razorpay'

type CreateOrderBody = {
  planSlug?: string
  email?: string
  name?: string
  phone?: string
  refundPolicyAcknowledged?: boolean
}

export async function POST(request: Request) {
  let body: CreateOrderBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const plan = getCoachingPlan(body.planSlug)
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
  }

  if (!body.email?.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!body.phone?.trim()) {
    return NextResponse.json({ error: 'WhatsApp number is required' }, { status: 400 })
  }
  if (body.refundPolicyAcknowledged !== true) {
    return NextResponse.json(
      { error: 'Refund and results guarantee policy acknowledgement is required' },
      { status: 400 }
    )
  }

  if (shouldBypassPayment()) {
    return NextResponse.json({
      testMode: true,
      orderId: `test_order_${Date.now()}`,
      amount: plan.amountPaise,
      currency: 'INR',
      keyId: 'test',
      plan,
    })
  }

  try {
    const receipt = `plan_${plan.slug}_${Date.now()}`
    const order = await createRazorpayOrder({
      amountPaise: plan.amountPaise,
      receipt,
      notes: {
        plan_slug: plan.slug,
        customer_email: body.email.trim().toLowerCase(),
        customer_name: body.name.trim(),
        customer_phone: body.phone.trim(),
        refund_policy_version: '2026-07-21',
        refund_policy_acknowledged_at: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      testMode: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: getRazorpayKeyId(),
      plan,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
