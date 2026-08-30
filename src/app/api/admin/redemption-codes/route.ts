import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createRedemptionCode, updateRedemptionCode } from '@/lib/redemption-codes'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AnyCoachingPlanSlug, CoachingPlanSlug } from '@/lib/payments/plans'
import { getPurchasablePlan } from '@/lib/payments/plans'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('redemption_codes')
    .select(
      '*, redemption_usages(user_id, redeemed_at, profiles:user_id(email, name))'
    )
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ codes: data })
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const {
    code,
    planSlug,
    maxRedemptions,
    membershipExpiresAt,
    expiresAt,
    isReusable,
    notes,
    memberLabel,
  } = body

  if (!code || !planSlug || !maxRedemptions || !membershipExpiresAt) {
    return NextResponse.json(
      { error: 'Code, plan, max uses, and membership expiry are required' },
      { status: 400 }
    )
  }
  if (!getPurchasablePlan(planSlug)) {
    return NextResponse.json({ error: 'Invalid plan slug' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await createRedemptionCode(
    {
      code,
      planSlug: planSlug as CoachingPlanSlug,
      maxRedemptions: Number(maxRedemptions),
      membershipExpiresAt: String(membershipExpiresAt),
      expiresAt: expiresAt || null,
      isReusable: Boolean(isReusable),
      notes,
      memberLabel: memberLabel || undefined,
      createdBy: auth.userId,
    },
    admin
  )

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ code: data })
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const {
    id,
    code,
    planSlug,
    maxRedemptions,
    membershipExpiresAt,
    expiresAt,
    isReusable,
    isActive,
    notes,
    memberLabel,
  } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (planSlug !== undefined) {
    if (!getPurchasablePlan(String(planSlug))) {
      return NextResponse.json({ error: 'Invalid plan slug' }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const { data, error } = await updateRedemptionCode(
    {
      id: String(id),
      code: code !== undefined ? String(code) : undefined,
      planSlug: planSlug !== undefined ? (String(planSlug) as AnyCoachingPlanSlug) : undefined,
      maxRedemptions: maxRedemptions !== undefined ? Number(maxRedemptions) : undefined,
      membershipExpiresAt:
        membershipExpiresAt !== undefined ? (membershipExpiresAt as string | null) : undefined,
      expiresAt: expiresAt !== undefined ? (expiresAt as string | null) : undefined,
      isReusable: isReusable !== undefined ? Boolean(isReusable) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      notes: notes !== undefined ? (notes as string | null) : undefined,
      memberLabel: memberLabel !== undefined ? (memberLabel as string | null) : undefined,
    },
    admin
  )

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ ok: true, code: data })
}
