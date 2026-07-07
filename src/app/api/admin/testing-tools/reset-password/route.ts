import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { TrialClientGuardError } from '@/lib/admin/trial-client-guard'
import { resetTrialClientPassword, resetTrialCoachPassword } from '@/lib/admin/testing-accounts'

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { accountType?: string; accountId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const accountType = body.accountType?.trim()
  const accountId = body.accountId?.trim()

  if (!accountId) {
    return NextResponse.json({ success: false, error: 'accountId is required' }, { status: 400 })
  }

  try {
    const account =
      accountType === 'coach'
        ? await resetTrialCoachPassword(accountId)
        : await resetTrialClientPassword(accountId)

    return NextResponse.json({ success: true, account })
  } catch (err) {
    if (err instanceof TrialClientGuardError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    const message = err instanceof Error ? err.message : 'Failed to reset password'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
