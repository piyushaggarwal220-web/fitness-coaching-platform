import { NextResponse } from 'next/server'
import { validateRedemptionCode } from '@/lib/redemption-codes'

export async function POST(request: Request) {
  try {
    const { code } = await request.json()
    if (!code?.trim()) {
      return NextResponse.json({ valid: false, error: 'Code is required' }, { status: 400 })
    }
    const result = await validateRedemptionCode(code)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ valid: false, error: 'Validation failed' }, { status: 500 })
  }
}
