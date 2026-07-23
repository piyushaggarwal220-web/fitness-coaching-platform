import { NextResponse } from 'next/server'
import { startEnrollment } from '@/lib/redemption-codes'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const code = typeof body.code === 'string' ? body.code : ''
    const email = typeof body.email === 'string' ? body.email : ''
    const name = typeof body.name === 'string' ? body.name : ''
    const origin =
      typeof body.origin === 'string'
        ? body.origin
        : request.headers.get('origin') || request.headers.get('referer')

    const result = await startEnrollment({ code, email, name, origin })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start enrollment' },
      { status: 400 }
    )
  }
}
