import { NextResponse } from 'next/server'
import { validateRedemptionCode } from '@/lib/redemption-codes'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const code = typeof body.code === 'string' ? body.code : ''
    const result = await validateRedemptionCode(code)
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 400 })
    }
    return NextResponse.json({
      valid: true,
      planName: result.planName,
      membershipExpiresAt: result.membershipExpiresAt ?? null,
      memberLabel: result.code?.member_label ?? null,
    })
  } catch (error) {
    return NextResponse.json(
      { valid: false, error: error instanceof Error ? error.message : 'Validation failed' },
      { status: 500 }
    )
  }
}
