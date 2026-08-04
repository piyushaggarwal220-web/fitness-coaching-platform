import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { extendClientMembership } from '@/lib/admin/extend-membership'

type RouteParams = { params: Promise<{ id: string }> }

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('add_months'),
    months: z.number().int().min(1).max(36),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    mode: z.literal('add_days'),
    days: z.number().int().min(1).max(3660),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    mode: z.literal('set_end_date'),
    endDate: z.string().trim().min(8).max(40),
    reason: z.string().trim().min(3).max(500),
  }),
])

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ success: false, error: 'Client id required' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid extend request. Check mode, amount/date, and reason.' },
      { status: 400 }
    )
  }

  try {
    const result = await extendClientMembership({
      clientId: id,
      performedBy: auth.userId,
      reason: parsed.data.reason,
      mode: parsed.data.mode,
      months: parsed.data.mode === 'add_months' ? parsed.data.months : undefined,
      days: parsed.data.mode === 'add_days' ? parsed.data.days : undefined,
      endDate: parsed.data.mode === 'set_end_date' ? parsed.data.endDate : undefined,
    })
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to extend membership'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
