import { NextResponse } from 'next/server'
import { completeEnrollment, verifyEnrollmentToken } from '@/lib/redemption-codes'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')?.trim() ?? ''
  const payload = verifyEnrollmentToken(token)
  if (!payload) {
    return NextResponse.json({ valid: false, error: 'Invalid or expired link' }, { status: 400 })
  }
  return NextResponse.json({
    valid: true,
    email: payload.email,
    name: payload.name,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const token = typeof body.token === 'string' ? body.token : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const result = await completeEnrollment({ token, password })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not complete enrollment' },
      { status: 400 }
    )
  }
}
