import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AccessSource } from '@/lib/entitlements'

export type ExtendMembershipMode = 'add_months' | 'add_days' | 'set_end_date'

export type ExtendMembershipInput = {
  clientId: string
  performedBy: string
  reason: string
  mode: ExtendMembershipMode
  /** Used when mode = add_months (1–36). */
  months?: number
  /** Used when mode = add_days (1–3660). */
  days?: number
  /** ISO date or datetime when mode = set_end_date. */
  endDate?: string
}

export type ExtendMembershipResult = {
  clientId: string
  previousExpiresAt: string | null
  newExpiresAt: string
  paymentConfirmed: boolean
  accessSource: AccessSource | null
}

function endOfDayUtcFromDateInput(value: string): Date {
  // Accept YYYY-MM-DD or full ISO. For date-only, set end of that calendar day UTC+0
  // then callers typically store ISO; admin UI uses local date input.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999))
  }
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Invalid end date.')
  }
  return parsed
}

/** Extend (or set) a client's membership timeline. Uses service role. */
export async function extendClientMembership(
  input: ExtendMembershipInput
): Promise<ExtendMembershipResult> {
  const reason = input.reason.trim()
  if (reason.length < 3) throw new Error('Please provide a short reason for the extension.')

  const admin = createAdminClient()
  const { data: profile, error: loadError } = await admin
    .from('profiles')
    .select('id, payment_confirmed, access_source, subscription_expires_at, role')
    .eq('id', input.clientId)
    .maybeSingle()

  if (loadError || !profile) {
    throw new Error(loadError?.message ?? 'Client not found.')
  }

  if (profile.role && profile.role !== 'client') {
    throw new Error('Membership can only be extended for client accounts.')
  }

  const previousExpiresAt =
    typeof profile.subscription_expires_at === 'string' ? profile.subscription_expires_at : null
  const existingMs = previousExpiresAt ? new Date(previousExpiresAt).getTime() : NaN
  const base = new Date(
    Number.isFinite(existingMs) ? Math.max(existingMs, Date.now()) : Date.now()
  )

  let nextExpiry: Date
  if (input.mode === 'add_months') {
    const months = input.months ?? 0
    if (!Number.isInteger(months) || months < 1 || months > 36) {
      throw new Error('Months must be a whole number between 1 and 36.')
    }
    nextExpiry = new Date(base.getTime())
    nextExpiry.setMonth(nextExpiry.getMonth() + months)
  } else if (input.mode === 'add_days') {
    const days = input.days ?? 0
    if (!Number.isInteger(days) || days < 1 || days > 3660) {
      throw new Error('Days must be a whole number between 1 and 3660.')
    }
    nextExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  } else if (input.mode === 'set_end_date') {
    if (!input.endDate?.trim()) throw new Error('End date is required.')
    nextExpiry = endOfDayUtcFromDateInput(input.endDate.trim())
    if (nextExpiry.getTime() <= Date.now()) {
      throw new Error('End date must be in the future.')
    }
  } else {
    throw new Error('Invalid extension mode.')
  }

  const newExpiresAt = nextExpiry.toISOString()
  const accessSource = (profile.access_source as AccessSource | null) ?? 'purchase'

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      payment_confirmed: true,
      access_source: accessSource === 'admin_trial' ? 'admin_trial' : accessSource,
      subscription_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.clientId)

  if (updateError) {
    throw new Error(updateError.message || 'Failed to update membership.')
  }

  await admin.from('admin_audit_logs').insert({
    action: 'extend_client_membership',
    target_user_id: input.clientId,
    target_role: 'client',
    performed_by: input.performedBy,
    reason,
    metadata: {
      mode: input.mode,
      months: input.months ?? null,
      days: input.days ?? null,
      endDate: input.endDate ?? null,
      previousExpiresAt,
      newExpiresAt,
      accessSource,
    },
  })

  return {
    clientId: input.clientId,
    previousExpiresAt,
    newExpiresAt,
    paymentConfirmed: true,
    accessSource,
  }
}
