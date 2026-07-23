import 'server-only'
import { hasClientEntitlement } from '@/lib/entitlements'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import type { ApiAuthResult } from '@/lib/api-auth'
import { requireApiUser } from '@/lib/api-auth'

/** Revoke paid access for clients whose subscription_expires_at has passed. */
export async function revokeExpiredClientSubscriptions(limit = 50): Promise<number> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: expired, error } = await admin
    .from('profiles')
    .select('id')
    .eq('payment_confirmed', true)
    .neq('access_source', 'admin_trial')
    .lt('subscription_expires_at', nowIso)
    .order('subscription_expires_at', { ascending: true })
    .limit(limit)

  if (error || !expired?.length) return 0

  let revoked = 0
  for (const row of expired) {
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        payment_confirmed: false,
        updated_at: nowIso,
      })
      .eq('id', row.id)
      .eq('payment_confirmed', true)

    if (updateError) continue

    await admin
      .from('plans')
      .update({ active: false, updated_at: nowIso })
      .eq('client_id', row.id)
      .eq('active', true)

    revoked += 1
  }

  return revoked
}

/**
 * Authenticate and require an active client entitlement.
 * Returns 403 when the subscription has ended or payment is not confirmed.
 */
export async function requireEntitledClientApiUser(): Promise<ApiAuthResult> {
  const auth = await requireApiUser()
  if (!auth.ok) return auth

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('payment_confirmed, access_source, subscription_expires_at, role')
    .eq('id', auth.user.id)
    .maybeSingle()

  const role = (profile as { role?: string | null } | null)?.role
  if (role === 'coach' || role === 'admin' || role === 'super_admin') {
    return auth
  }

  if (!hasClientEntitlement(profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Your coaching plan has ended. Renew to continue using the app.',
          code: 'entitlement_expired',
        },
        { status: 403 }
      ),
    }
  }

  return auth
}
