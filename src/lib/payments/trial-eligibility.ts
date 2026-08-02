import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhoneForWhatsApp } from '@/lib/phone'
import { isTrialPlanSlug } from '@/lib/payments/plans'

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function normalizePhone(raw: string): string {
  return normalizePhoneForWhatsApp(raw) ?? raw.replace(/\D/g, '')
}

export function trialFingerprint(email: string, phone: string): string {
  return `${normalizeEmail(email)}|${normalizePhone(phone)}`.toLowerCase()
}

export type TrialEligibilityResult =
  | { ok: true }
  | { ok: false; error: string; status: number; reason: 'already_used' | 'has_paid' | 'invalid' }

/**
 * Once-per-lifetime trial: block if this email/phone already captured/redeemed a trial
 * or already has any successful non-trial paid purchase / active access.
 */
export async function assertTrialPurchaseEligible(input: {
  admin: SupabaseClient
  email: string
  phone: string
}): Promise<TrialEligibilityResult> {
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone)
  if (!email.includes('@') || !phone) {
    return {
      ok: false,
      error: 'Valid email and WhatsApp number are required for the trial.',
      status: 400,
      reason: 'invalid',
    }
  }

  const { data: priorPurchases, error: purchaseError } = await input.admin
    .from('purchases')
    .select('id, plan_slug, customer_email, customer_phone')
    .in('status', ['captured', 'redeemed'])
    .or(`customer_email.eq.${email}`)
    .limit(100)

  if (purchaseError) {
    return {
      ok: false,
      error: `Could not verify trial eligibility: ${purchaseError.message}`,
      status: 500,
      reason: 'invalid',
    }
  }

  const rows = priorPurchases ?? []

  // Also scan recent trials by phone (email may differ)
  const { data: trialRows, error: trialError } = await input.admin
    .from('purchases')
    .select('id, plan_slug, customer_email, customer_phone')
    .eq('plan_slug', '1_week_trial')
    .in('status', ['captured', 'redeemed'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (trialError) {
    return {
      ok: false,
      error: `Could not verify trial eligibility: ${trialError.message}`,
      status: 500,
      reason: 'invalid',
    }
  }

  const all = [...rows]
  for (const row of trialRows ?? []) {
    if (!all.some((r) => r.id === row.id)) all.push(row)
  }

  for (const row of all) {
    const rowEmail = row.customer_email ? normalizeEmail(String(row.customer_email)) : ''
    const rowPhone = row.customer_phone ? normalizePhone(String(row.customer_phone)) : ''
    const emailMatch = rowEmail === email
    const phoneMatch = Boolean(rowPhone && rowPhone === phone)

    if (!emailMatch && !phoneMatch) continue

    if (isTrialPlanSlug(row.plan_slug)) {
      return {
        ok: false,
        error:
          'You’ve already used the 7-day trial. Choose a 3, 6, or 12 month plan to continue.',
        status: 400,
        reason: 'already_used',
      }
    }

    return {
      ok: false,
      error:
        'Trial is for new customers only. This email or WhatsApp already has a coaching purchase — pick a renewal plan instead.',
      status: 400,
      reason: 'has_paid',
    }
  }

  const { data: profile } = await input.admin
    .from('profiles')
    .select('id, payment_confirmed, access_source')
    .eq('email', email)
    .maybeSingle()

  if (
    profile?.payment_confirmed === true &&
    (profile.access_source === 'purchase' ||
      profile.access_source === 'enrollment_code' ||
      profile.access_source === 'admin_trial')
  ) {
    return {
      ok: false,
      error:
        'Trial is for new customers only. This account already has coaching access — pick a plan to renew.',
      status: 400,
      reason: 'has_paid',
    }
  }

  return { ok: true }
}
