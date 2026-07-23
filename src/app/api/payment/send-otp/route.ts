import { NextResponse } from 'next/server'
import { sendCheckoutOtp, type CheckoutOtpChannel } from '@/lib/payments/checkout-otp'

type Body = {
  channel?: CheckoutOtpChannel
  email?: string
  phone?: string
  name?: string
  verificationId?: string
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')
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
  if (!body.email?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ error: 'email and phone are required' }, { status: 400 })
  }

  const result = await sendCheckoutOtp({
    channel: body.channel,
    email: body.email,
    phone: body.phone,
    name: body.name,
    verificationId: body.verificationId,
    ip: clientIp(request),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    success: true,
    verificationId: result.verificationId,
    channel: result.channel,
    emailVerified: result.emailVerified,
    phoneVerified: result.phoneVerified,
    ...(result.bypassCode ? { bypassCode: result.bypassCode } : {}),
  })
}
