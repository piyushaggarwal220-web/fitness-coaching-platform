import { NextResponse } from 'next/server'
import { isPublicDemoEmail } from '@/lib/public-demo'
import { publicDemoReadOnlyJson } from '@/lib/public-demo-guard'
import {
  getCheckoutIntakeBasicsByVerification,
  upsertCheckoutIntakeBasics,
} from '@/lib/payments/checkout-intake-basics'
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
      { error: status.error ?? 'Verification not found' },
      { status: status.expired ? 400 : 404 }
    )
  }
  if (!status.emailVerified) {
    return NextResponse.json({ error: 'Verify your email first', complete: false }, { status: 400 })
  }

  const basics = await getCheckoutIntakeBasicsByVerification(verificationId)
  if (!basics || basics.consumed_at) {
    return NextResponse.json({
      complete: false,
      email: status.email,
    })
  }

  return NextResponse.json({
    complete: true,
    email: status.email,
    basics: {
      age: basics.age,
      gender: basics.gender,
      heightCm: basics.height_cm,
      weightKg: basics.weight_kg,
      dietPreference: basics.diet_preference,
      mainGoal: basics.main_goal,
      planSlug: basics.plan_slug,
      name: basics.customer_name,
      phone: basics.phone_e164,
    },
  })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (isPublicDemoEmail(typeof body.email === 'string' ? body.email : undefined)) {
    return publicDemoReadOnlyJson()
  }

  const result = await upsertCheckoutIntakeBasics({
    verificationId: typeof body.verificationId === 'string' ? body.verificationId : '',
    email: typeof body.email === 'string' ? body.email : '',
    phone: typeof body.phone === 'string' ? body.phone : '',
    name: typeof body.name === 'string' ? body.name : undefined,
    planSlug: typeof body.planSlug === 'string' ? body.planSlug : '',
    age: body.age as number | string,
    gender: typeof body.gender === 'string' ? body.gender : '',
    heightCm: body.heightCm as number | string,
    weightKg: body.weightKg as number | string | null | undefined,
    dietPreference: typeof body.dietPreference === 'string' ? body.dietPreference : '',
    mainGoal: typeof body.mainGoal === 'string' ? body.mainGoal : '',
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missing: result.missing },
      { status: result.status }
    )
  }

  return NextResponse.json({
    success: true,
    complete: true,
    basicsId: result.basics.id,
  })
}
