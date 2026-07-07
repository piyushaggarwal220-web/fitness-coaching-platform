import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createFakeTrialClient } from '@/lib/admin/testing-accounts'

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { coachId?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const account = await createFakeTrialClient(body.coachId?.trim() || null)
    return NextResponse.json({ success: true, account })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate fake client'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
