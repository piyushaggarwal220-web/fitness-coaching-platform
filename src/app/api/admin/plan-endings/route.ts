import { NextResponse } from 'next/server'
import { getPlanEndings } from '@/lib/admin/plan-endings'
import { requireAdminApi } from '@/lib/admin/api-auth'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const payload = await getPlanEndings()
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load plan endings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
