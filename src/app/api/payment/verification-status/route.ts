import { NextResponse } from 'next/server'
import { getCheckoutVerificationStatus } from '@/lib/payments/checkout-otp'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const verificationId = searchParams.get('verificationId')?.trim()
  if (!verificationId) {
    return NextResponse.json({ error: 'verificationId is required' }, { status: 400 })
  }

  const status = await getCheckoutVerificationStatus(verificationId)
  if (!status.ok) {
    return NextResponse.json(
      { success: false, emailVerified: false, error: status.error, expired: status.expired },
      { status: status.expired ? 400 : 404 }
    )
  }

  return NextResponse.json({
    success: true,
    emailVerified: status.emailVerified,
    email: status.email,
  })
}
