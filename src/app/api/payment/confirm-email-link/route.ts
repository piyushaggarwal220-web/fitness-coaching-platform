import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { confirmCheckoutEmailFromSession } from '@/lib/payments/checkout-otp'

type Body = {
  verificationId?: string
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const verificationId = body.verificationId?.trim()
  if (!verificationId) {
    return NextResponse.json({ error: 'verificationId is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json(
      { error: 'Open the verification link from your email on this device first.' },
      { status: 401 }
    )
  }

  const result = await confirmCheckoutEmailFromSession({
    verificationId,
    sessionEmail: user.email,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Drop the temporary auth session created by the magic link.
  await supabase.auth.signOut()

  return NextResponse.json({ success: true, emailVerified: true, verificationId })
}
