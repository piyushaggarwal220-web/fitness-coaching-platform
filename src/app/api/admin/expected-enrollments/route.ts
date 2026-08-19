import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { getExpectedEnrollments } from '@/lib/admin/expected-enrollments'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    return NextResponse.json(await getExpectedEnrollments())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load expected enrollments'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
