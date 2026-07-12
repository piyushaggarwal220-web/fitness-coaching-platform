import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createRedemptionCode, normalizeRedemptionCode } from '@/lib/redemption-codes'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CoachingPlanSlug } from '@/lib/payments/plans'
import { isValidPlanSlug } from '@/lib/payments/plans'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('redemption_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ codes: data })
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { code, planSlug, durationMonths, maxRedemptions, expiresAt, isReusable, notes } = body

  if (!code || !planSlug || !durationMonths || !maxRedemptions) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!isValidPlanSlug(planSlug)) {
    return NextResponse.json({ error: 'Invalid plan slug' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await createRedemptionCode(
    {
      code,
      planSlug: planSlug as CoachingPlanSlug,
      durationMonths: Number(durationMonths),
      maxRedemptions: Number(maxRedemptions),
      expiresAt: expiresAt || null,
      isReusable: Boolean(isReusable),
      notes,
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
  const { id, isActive, notes } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (isActive !== undefined) payload.is_active = isActive
  if (notes !== undefined) payload.notes = notes

  const { error } = await admin.from('redemption_codes').update(payload).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
