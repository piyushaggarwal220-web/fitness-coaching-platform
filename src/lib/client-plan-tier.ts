/**
 * Plan tier for at-a-glance prioritisation in the coach portal.
 *
 * Longer commitments get the loudest treatment so a coach can see who is on a 12 month plan
 * without opening the client. Tier comes from the client's latest purchase row — plan length is
 * not stored on profiles.
 */
import type { AccessSource } from '@/lib/entitlements'

export type ClientPlanTier = '12_months' | '6_months' | '3_months' | 'other'

/**
 * Colours are tuned for the LIGHT coach portal, so the 3 month "white" tier needs a visible
 * outline — a pure white fill would disappear against the white card background.
 */
export type PlanTierTheme = {
  tier: ClientPlanTier
  label: string
  /** Left edge stripe on the request card. */
  stripe: string
  chipBg: string
  chipText: string
  chipBorder: string
}

const THEMES: Record<ClientPlanTier, PlanTierTheme> = {
  '12_months': {
    tier: '12_months',
    label: 'Fat loss + muscle',
    stripe: '#ea580c',
    chipBg: 'rgba(234, 88, 12, 0.12)',
    chipText: '#c2410c',
    chipBorder: 'rgba(234, 88, 12, 0.35)',
  },
  '6_months': {
    tier: '6_months',
    label: 'Fat loss',
    stripe: '#71717a',
    chipBg: 'rgba(113, 113, 122, 0.14)',
    chipText: '#3f3f46',
    chipBorder: 'rgba(113, 113, 122, 0.35)',
  },
  '3_months': {
    tier: '3_months',
    label: 'Look sharper',
    stripe: '#ffffff',
    chipBg: '#ffffff',
    chipText: '#52525b',
    chipBorder: 'rgba(24, 24, 27, 0.22)',
  },
  other: {
    tier: 'other',
    label: 'Membership',
    stripe: 'rgba(24, 24, 27, 0.12)',
    chipBg: 'rgba(24, 24, 27, 0.05)',
    chipText: '#71717a',
    chipBorder: 'rgba(24, 24, 27, 0.12)',
  },
}

export function planTierFromSlug(slug: string | null | undefined): ClientPlanTier {
  if (slug === '12_months') return '12_months'
  if (slug === '6_months') return '6_months'
  if (slug === '3_months') return '3_months'
  return 'other'
}

export function getPlanTierTheme(slug: string | null | undefined): PlanTierTheme {
  return THEMES[planTierFromSlug(slug)]
}

export function isEnrollmentCodeClient(accessSource: AccessSource | null | undefined): boolean {
  return accessSource === 'enrollment_code'
}

type PurchaseTierRow = {
  user_id: string | null
  plan_slug: string | null
  status: string | null
  created_at: string | null
}

/**
 * Latest paid-or-redeemed plan slug per client.
 *
 * Enrollment redemptions are written as purchases with status `redeemed`, so both statuses count.
 * We deliberately read the real slug rather than assuming enrollment means 12 months.
 */
export function buildPlanSlugByClient(
  rows: PurchaseTierRow[] | null | undefined
): Map<string, string> {
  const latestAt = new Map<string, number>()
  const slugByClient = new Map<string, string>()

  for (const row of rows ?? []) {
    if (!row.user_id || !row.plan_slug) continue
    if (row.status !== 'captured' && row.status !== 'redeemed') continue

    const at = row.created_at ? Date.parse(row.created_at) : NaN
    const time = Number.isFinite(at) ? at : 0
    const seen = latestAt.get(row.user_id)
    if (seen != null && seen >= time) continue

    latestAt.set(row.user_id, time)
    slugByClient.set(row.user_id, row.plan_slug)
  }

  return slugByClient
}
