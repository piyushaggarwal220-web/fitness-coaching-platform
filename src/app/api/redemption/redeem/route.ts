import { NextResponse } from 'next/server'
import { redeemCode } from '@/lib/redemption-codes'
import { establishPurchaseSession } from '@/lib/payments/purchase-session'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { code, email, name, password } = body

    if (!code || !email || !name || !password) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 })
    }

    const result = await redeemCode({ code, email, name, password })
    const session = await establishPurchaseSession(email.trim().toLowerCase(), password)

    return NextResponse.json({
      success: true,
      userId: result.userId,
      isNewUser: result.isNewUser,
      sessionEstablished: session.ok,
      redirectTo: result.redirectTo,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Redemption failed'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
