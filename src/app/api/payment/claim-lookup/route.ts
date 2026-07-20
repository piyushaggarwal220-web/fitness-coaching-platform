import { NextResponse } from 'next/server'
import { lookupClaimablePurchase } from '@/lib/payments/fulfillment'

type LookupBody = {
  token?: string
  email?: string
  paymentId?: string
}

export async function POST(request: Request) {
  let body: LookupBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const purchase = await lookupClaimablePurchase({
      token: body.token,
      email: body.email,
      paymentId: body.paymentId,
    })

    return NextResponse.json({
      success: true,
      customerEmail: purchase.customerEmail,
      customerName: purchase.customerName,
      planSlug: purchase.planSlug,
      planName: purchase.planName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
