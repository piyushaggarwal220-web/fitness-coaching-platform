import { NextResponse } from 'next/server'
import { verifyCheckoutOtp, type CheckoutOtpChannel } from '@/lib/payments/checkout-otp'

type Body = {
  channel?: CheckoutOtpChannel
  code?: string
  verificationId?: string
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.channel !== 'email' && body.channel !== 'whatsapp') {
    return NextResponse.json({ error: 'channel must be email or whatsapp' }, { status: 400 })
  }
  if (!body.code?.trim() || !body.verificationId?.trim()) {
    return NextResponse.json({ error: 'code and verificationId are required' }, { status: 400 })
  }

  const result = await verifyCheckoutOtp({
    channel: body.channel,
    code: body.code,
    verificationId: body.verificationId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    success: true,
    verificationId: result.verificationId,
    emailVerified: result.emailVerified,
    phoneVerified: result.phoneVerified,
    bothVerified: result.bothVerified,
  })
}
