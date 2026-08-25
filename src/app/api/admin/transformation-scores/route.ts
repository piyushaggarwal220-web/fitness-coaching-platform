import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { loadTransformationScores } from '@/lib/transformation-scores'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  try {
    const scores = await loadTransformationScores()
    return NextResponse.json({ scores })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load scores' },
      { status: 500 }
    )
  }
}
