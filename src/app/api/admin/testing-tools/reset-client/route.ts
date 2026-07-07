import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { TrialClientGuardError } from '@/lib/admin/trial-client-guard'
import { resetTrialClient } from '@/lib/admin/trial-client-reset'

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { clientId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const clientId = body.clientId?.trim()
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'clientId is required' }, { status: 400 })
  }

  try {
    const result = await resetTrialClient(clientId)
    return NextResponse.json({ success: true, result })
  } catch (err) {
    if (err instanceof TrialClientGuardError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    const message = err instanceof Error ? err.message : 'Failed to reset trial client'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
