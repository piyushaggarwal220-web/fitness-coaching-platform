import { NextResponse } from 'next/server'
import { completeCheckoutPayment } from '@/lib/payments/complete-checkout-payment'

type VerifyPaymentBody = {
  planSlug?: string
  email?: string
  name?: string
  phone?: string
  meta_fbp?: string
  meta_fbc?: string
  landingPath?: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
  razorpay_signature?: string
}

export async function POST(request: Request) {
  let body: VerifyPaymentBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await completeCheckoutPayment({
    request,
    planSlug: body.planSlug,
    email: body.email,
    name: body.name,
    phone: body.phone,
    meta_fbp: body.meta_fbp,
    meta_fbc: body.meta_fbc,
    landingPath: body.landingPath,
    orderId: body.razorpay_order_id ?? '',
    paymentId: body.razorpay_payment_id ?? '',
    signature: body.razorpay_signature ?? '',
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    success: true,
    alreadyClaimed: result.alreadyClaimed,
    purchaseId: result.purchaseId,
    redirectTo: result.redirectTo,
    ...(result.message ? { message: result.message } : {}),
  })
}
