import { NextResponse } from 'next/server'
import { requireSuperAdminApi } from '@/lib/admin/api-auth'
import { deleteCoachAccount } from '@/lib/admin/account-deletion'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const coachId = id?.trim()
  if (!coachId) {
    return NextResponse.json({ success: false, error: 'Invalid coach id' }, { status: 400 })
  }

  let body: { reason?: string | null; reassignToCoachId?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const result = await deleteCoachAccount({
    coachId,
    deletedBy: auth.userId,
    reason: body.reason ?? null,
    reassignToCoachId: body.reassignToCoachId ?? null,
  })

  if (!result.ok && result.blocked) {
    return NextResponse.json(
      {
        success: false,
        error: `This coach currently has ${result.blocked.assignedClients} active clients.`,
        assignedClients: result.blocked.assignedClients,
      },
      { status: 409 }
    )
  }

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, deleted: result.deleted })
}

