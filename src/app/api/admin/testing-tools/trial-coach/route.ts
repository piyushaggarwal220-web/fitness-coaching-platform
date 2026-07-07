import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createTrialCoach } from '@/lib/admin/testing-accounts'

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { name?: string; email?: string; password?: string }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const account = await createTrialCoach({
      name: body.name?.trim() ?? '',
      email: body.email?.trim() ?? '',
      password: body.password?.trim() ?? '',
    })

    return NextResponse.json({ success: true, account })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create trial coach'
    const status = message.includes('already exists') ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
