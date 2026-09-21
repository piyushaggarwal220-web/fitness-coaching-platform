import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { resolveApproval, listPendingApprovals } from '@/lib/jarvis/permissions/approval-engine'
import { sanitizePublicJson, humanizeJarvisError } from '@/lib/jarvis/operator-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

function publicApproval(row: Awaited<ReturnType<typeof listPendingApprovals>>[number]) {
  return {
    ...row,
    current_state: sanitizePublicJson(row.current_state) ?? {},
    proposed_state: sanitizePublicJson(row.proposed_state) ?? {},
    evidence: Array.isArray(row.evidence) ? (row.evidence as unknown[]).slice(0, 8) : [],
  }
}

export async function GET() {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response
  const approvals = await listPendingApprovals(50)
  return NextResponse.json({ success: true, approvals: approvals.map(publicApproval) })
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    approvalId?: string
    approve?: boolean
    modification?: Record<string, unknown>
  }

  if (!body.approvalId || typeof body.approve !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'approvalId and approve required' },
      { status: 400 }
    )
  }

  const result = await resolveApproval({
    approvalId: body.approvalId,
    approve: body.approve,
    actorId: auth.user.id,
    modification: body.modification,
  })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: humanizeJarvisError(result.error) },
      { status: 400 }
    )
  }
  return NextResponse.json({ success: true, ...result })
}
