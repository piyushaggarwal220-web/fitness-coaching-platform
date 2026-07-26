import { NextResponse } from 'next/server'
import { redeemCode } from '@/lib/redemption-codes'
import { requireApiUser } from '@/lib/api-auth'

export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { code, email, name } = body

    if (!code || !email || !name) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!auth.user.email || auth.user.email.trim().toLowerCase() !== normalizedEmail) {
      return NextResponse.json(
        { success: false, error: 'Redemption email must match your signed-in account.' },
        { status: 403 }
      )
    }

    const result = await redeemCode({
      code,
      email: normalizedEmail,
      name,
      userId: auth.user.id,
    })

    return NextResponse.json({
      success: true,
      userId: result.userId,
      isNewUser: result.isNewUser,
      sessionEstablished: true,
      redirectTo: result.redirectTo,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Redemption failed'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
