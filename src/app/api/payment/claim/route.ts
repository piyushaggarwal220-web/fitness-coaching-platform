import { NextResponse } from 'next/server'
import { claimPurchaseWithPassword } from '@/lib/payments/fulfillment'
import { consumeCheckoutIntakeBasicsForUser } from '@/lib/payments/checkout-intake-basics'
import { logPurchaseStep } from '@/lib/payments/purchase-flow-log'
import { establishPurchaseSession } from '@/lib/payments/purchase-session'
import { scheduleOpportunisticNotificationDrain } from '@/lib/notifications/drain'

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

    let intakeBasicsMerged: boolean | null = null
    let intakeBasicsMergeError: string | undefined
    try {
      const basics = await consumeCheckoutIntakeBasicsForUser({
        email: result.email,
        userId: result.userId,
      })
      intakeBasicsMerged = Boolean(basics)
      if (basics) {
        logPurchaseStep('checkout_intake_basics_merged', {
          email: result.email,
          userId: result.userId,
          basicsId: basics.id,
        })
      } else {
        logPurchaseStep('checkout_intake_basics_none', {
          email: result.email,
          userId: result.userId,
        })
      }
    } catch (basicsError) {
      // Claim must still succeed (money already captured), but do not hide the miss.
      intakeBasicsMerged = false
      intakeBasicsMergeError =
        basicsError instanceof Error ? basicsError.message : 'unknown'
      logPurchaseStep('checkout_intake_basics_merge_failed', {
        email: result.email,
        userId: result.userId,
        error: intakeBasicsMergeError,
      })
    }

    scheduleOpportunisticNotificationDrain()

    const intakeMeta = {
      intakeBasicsMerged,
      ...(intakeBasicsMergeError ? { intakeBasicsMergeError } : {}),
    }

    if (result.needsLogin) {
      return NextResponse.json({
        success: true,
        userId: result.userId,
        purchaseId: result.purchaseId,
        isNewUser: false,
        sessionEstablished: false,
        needsLogin: true,
        ...intakeMeta,
        redirectTo: '/login?linked=1',
        message:
          'Payment linked to your existing account. Sign in with your current password, or use Forgot password if it never worked.',
      })
    }

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
          ...intakeMeta,
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
      ...intakeMeta,
      redirectTo: '/onboarding',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create account'
    logPurchaseStep('claim_failed', { error: message })
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
