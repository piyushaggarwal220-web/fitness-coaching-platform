import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { listCoachesForAssignment } from '@/lib/admin/testing-accounts'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const coaches = await listCoachesForAssignment()
    return NextResponse.json({ success: true, coaches })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load coaches'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
