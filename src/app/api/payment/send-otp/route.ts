import { NextResponse } from 'next/server'
import { sendCheckoutOtp } from '@/lib/payments/checkout-otp'

type Body = {
  channel?: string
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

  if (body.channel === 'whatsapp') {
    return NextResponse.json(
      { error: 'WhatsApp verification is temporarily unavailable. Use email.' },
      { status: 400 }
    )
  }
  if (body.channel !== 'email') {
    return NextResponse.json({ error: 'channel must be email' }, { status: 400 })
  }
  if (!body.email?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ error: 'email and phone are required' }, { status: 400 })
  }

  const result = await sendCheckoutOtp({
    channel: 'email',
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
    delivery: result.delivery,
    emailVerified: result.emailVerified,
    ...(result.bypassCode ? { bypassCode: result.bypassCode } : {}),
  })
}
