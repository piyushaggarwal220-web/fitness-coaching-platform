import { NextResponse } from 'next/server'
import { getActiveTodayMetrics } from '@/lib/admin/active-today'
import { requireAdminApi } from '@/lib/admin/api-auth'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    return NextResponse.json(await getActiveTodayMetrics())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load active today'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
