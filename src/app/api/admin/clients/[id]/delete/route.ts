import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/admin/api-auth'
import { deleteClientAccount } from '@/lib/admin/account-deletion'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const clientId = id?.trim()
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'Invalid client id' }, { status: 400 })
  }

  let body: { reason?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const result = await deleteClientAccount({
    clientId,
    deletedBy: auth.userId,
    reason: body.reason ?? null,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, deleted: result.deleted })
}

