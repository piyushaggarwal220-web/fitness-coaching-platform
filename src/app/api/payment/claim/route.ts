import { NextResponse } from 'next/server'
import { claimPurchaseWithPassword } from '@/lib/payments/fulfillment'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { establishPurchaseSession } from '@/lib/payments/purchase-session'

type ClaimBody = {
  token?: string
  email?: string
  paymentId?: string
  password?: string
  name?: string
}

export async function POST(request: Request) {
  let body: ClaimBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const password = body.password ?? ''
  if (password.length < 6) {
    return NextResponse.json(
      { success: false, error: 'Password must be at least 6 characters' },
      { status: 400 }
    )
  }

  const hasToken = Boolean(body.token?.trim())
  const hasReceipt = Boolean(body.email?.trim() && body.paymentId?.trim())
  if (!hasToken && !hasReceipt) {
    return NextResponse.json(
      {
        success: false,
        error: 'Provide your setup link token, or your email plus Razorpay payment ID',
      },
      { status: 400 }
    )
  }

  try {
    const result = await claimPurchaseWithPassword({
      token: body.token,
      email: body.email,
      paymentId: body.paymentId,
      password,
      name: body.name,
    })

    const session = await establishPurchaseSession(result.email, password)
    if (!session.ok) {
      logPurchaseStep('fulfillment_failed', {
        step: 'automatic_sign_in',
        email: result.email,
        userId: result.userId,
        error: session.error,
      })
      return NextResponse.json(
        {
          success: false,
          error:
            'Your account was created but we could not sign you in automatically. Please use the login page.',
          redirectTo: '/login',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      userId: result.userId,
      purchaseId: result.purchaseId,
      isNewUser: result.isNewUser,
      sessionEstablished: true,
      redirectTo: '/onboarding',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create account'
    logPurchaseStep('claim_failed', { error: message })
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
