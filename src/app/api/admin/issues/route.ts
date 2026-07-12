import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { updateIssueStatus } from '@/lib/issue-reports'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IssueStatus } from '@/types/database'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('issue_reports')
    .select('*, profiles(name, email)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ issues: data })
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { id, status, adminNotes } = body
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await updateIssueStatus(admin, id, status as IssueStatus, adminNotes)
  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
