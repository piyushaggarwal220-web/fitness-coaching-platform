import { NextResponse } from 'next/server'
import { resumeCheckoutPayment } from '@/lib/payments/complete-checkout-payment'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { orderId?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const result = await resumeCheckoutPayment({
      request,
      orderId: body.orderId ?? '',
      email: body.email ?? '',
    })
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, pending: 'pending' in result ? result.pending === true : false },
        { status: result.status }
      )
    }
    return NextResponse.json({
      success: true,
      redirectTo: result.redirectTo,
      purchaseId: result.purchaseId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not confirm the payment'
    return NextResponse.json({ success: false, error: message, pending: true }, { status: 200 })
  }
}
