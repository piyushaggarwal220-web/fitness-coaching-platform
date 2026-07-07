import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { listTrialClients } from '@/lib/admin/testing-accounts'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const clients = await listTrialClients()
    return NextResponse.json({ success: true, clients })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load trial clients'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
