import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi, requireSuperAdminApi } from '@/lib/admin/api-auth'
import {
  cancelPurchaseSubscription,
  refundPurchase,
  resendPurchaseSetup,
  retryMetaPurchase,
} from '@/lib/payments/admin-operations'

type RouteParams = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  action: z.enum(['refund', 'cancel', 'resend_setup', 'retry_meta']),
  reason: z.string().trim().min(8).max(500),
  idempotencyKey: z.string().uuid(),
  amountPaise: z.number().int().positive().optional(),
  noResultClaimed: z.boolean().optional(),
  evidenceSummary: z.string().trim().max(2000).optional(),
})

export async function POST(request: Request, { params }: RouteParams) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid operation request' }, { status: 400 })
  }

  const destructive = parsed.data.action === 'refund' || parsed.data.action === 'cancel'
  const auth = destructive ? await requireSuperAdminApi() : await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let result: unknown
    switch (parsed.data.action) {
      case 'refund':
        if (!parsed.data.amountPaise) {
          return NextResponse.json({ success: false, error: 'Refund amount is required' }, { status: 400 })
        }
        result = await refundPurchase({
          purchaseId: id,
          amountPaise: parsed.data.amountPaise,
          performedBy: auth.userId,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
          noResultClaimed: parsed.data.noResultClaimed === true,
          evidenceSummary: parsed.data.evidenceSummary ?? '',
        })
        break
      case 'cancel':
        result = await cancelPurchaseSubscription({
          purchaseId: id,
          performedBy: auth.userId,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
        })
        break
      case 'resend_setup':
        result = await resendPurchaseSetup({
          purchaseId: id,
          performedBy: auth.userId,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
        })
        break
      case 'retry_meta':
        result = await retryMetaPurchase({
          purchaseId: id,
          performedBy: auth.userId,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
        })
        break
    }
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment operation failed'
    const status = /pending reconciliation|outcome is uncertain/i.test(message) ? 409 : 400
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
