import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import {
  createPromoCode,
  listPromoCodes,
  updatePromoCode,
} from '@/lib/payments/promo-codes'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PromoCodeKind, PromoDiscountType } from '@/types/database'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { codes, error } = await listPromoCodes(admin)
  if (error) {
    const missing = /relation .*promo_codes.* does not exist|could not find the table/i.test(error)
    return NextResponse.json(
      {
        error: missing
          ? 'Promo codes table is missing. Apply migration 20260803100000_promo_codes.sql then reload.'
          : error,
      },
      { status: 500 }
    )
  }
  return NextResponse.json({ codes })
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const kind = String(body.kind ?? '') as PromoCodeKind
  const discountType = String(body.discountType ?? '') as PromoDiscountType

  const admin = createAdminClient()
  const { data, error } = await createPromoCode(
    {
      code: String(body.code ?? ''),
      kind,
      discountType,
      discountPaise: body.discountPaise != null ? Number(body.discountPaise) : undefined,
      discountPercent: body.discountPercent != null ? Number(body.discountPercent) : undefined,
      planDiscountsPaise:
        body.planDiscountsPaise && typeof body.planDiscountsPaise === 'object'
          ? (body.planDiscountsPaise as Record<string, number>)
          : undefined,
      applicablePlans: Array.isArray(body.applicablePlans)
        ? (body.applicablePlans as string[])
        : null,
      firstTimerOnly: Boolean(body.firstTimerOnly),
      maxRedemptions: Number(body.maxRedemptions ?? 100),
      expiresAt: body.expiresAt ? String(body.expiresAt) : null,
      referrerLabel: body.referrerLabel ? String(body.referrerLabel) : null,
      notes: body.notes ? String(body.notes) : null,
      createdBy: auth.userId,
    },
    admin
  )

  if (error || !data) return NextResponse.json({ error: error ?? 'Create failed' }, { status: 400 })
  return NextResponse.json({ code: data })
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await updatePromoCode(
    {
      id,
      code: body.code != null ? String(body.code) : undefined,
      kind: body.kind != null ? (String(body.kind) as PromoCodeKind) : undefined,
      discountType:
        body.discountType != null ? (String(body.discountType) as PromoDiscountType) : undefined,
      discountPaise: body.discountPaise != null ? Number(body.discountPaise) : undefined,
      discountPercent: body.discountPercent != null ? Number(body.discountPercent) : undefined,
      planDiscountsPaise:
        body.planDiscountsPaise && typeof body.planDiscountsPaise === 'object'
          ? (body.planDiscountsPaise as Record<string, number>)
          : undefined,
      applicablePlans: Array.isArray(body.applicablePlans)
        ? (body.applicablePlans as string[])
        : body.applicablePlans === null
          ? null
          : undefined,
      firstTimerOnly:
        body.firstTimerOnly !== undefined ? Boolean(body.firstTimerOnly) : undefined,
      maxRedemptions:
        body.maxRedemptions != null ? Number(body.maxRedemptions) : undefined,
      remainingUses: body.remainingUses != null ? Number(body.remainingUses) : undefined,
      expiresAt: body.expiresAt !== undefined ? (body.expiresAt ? String(body.expiresAt) : null) : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      referrerLabel:
        body.referrerLabel !== undefined
          ? body.referrerLabel
            ? String(body.referrerLabel)
            : null
          : undefined,
      notes:
        body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined,
    },
    admin
  )

  if (error || !data) return NextResponse.json({ error: error ?? 'Update failed' }, { status: 400 })
  return NextResponse.json({ code: data })
}
