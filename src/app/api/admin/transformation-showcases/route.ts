import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadTransformationShowcases, updateShowcaseStatus } from '@/lib/transformation-showcases'
import type { TransformationShowcaseStatus } from '@/lib/transformation-showcases'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const showcases = await loadTransformationShowcases(admin)
  return NextResponse.json({ showcases })
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as {
    showcaseId?: string
    status?: TransformationShowcaseStatus
    adminNote?: string
  } | null

  const showcaseId = body?.showcaseId?.trim()
  const status = body?.status
  const allowed: TransformationShowcaseStatus[] = ['approved', 'published', 'rejected']
  if (!showcaseId || !status || !allowed.includes(status)) {
    return NextResponse.json({ error: 'showcaseId and valid status required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await updateShowcaseStatus(admin, showcaseId, {
    status,
    approvedBy: auth.userId,
    adminNote: body?.adminNote ?? null,
  })

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
