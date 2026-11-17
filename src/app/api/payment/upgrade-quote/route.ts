import { NextResponse } from 'next/server'
import { normalizeCheckoutEmail } from '@/lib/payments/checkout-otp'
import { loadHeldPlansForUpgrade, snapshotHeldPlans } from '@/lib/payments/plan-upgrade-lookup'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Plans this email already holds, so checkout can show the leftover upgrade price.
 * The charge itself is recalculated in create-order. A lookup failure is not "no plan".
 */
export async function POST(request: Request) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = normalizeCheckoutEmail(body.email ?? '')
  if (!email.includes('@')) {
    return NextResponse.json({ held: [] })
  }

  const held = await loadHeldPlansForUpgrade(createAdminClient(), email)
  if (!held.ok) {
    return NextResponse.json({ error: held.error }, { status: 503 })
  }

  return NextResponse.json({ held: snapshotHeldPlans(held.plans) })
}
