import type { CoachingPlanSlug } from '@/lib/payments/plans'
import { getCoachingPlan } from '@/lib/payments/plans'
import type { LeagueTier } from '@/lib/league/scoring'

/** Highest free-ladder division before Crazy (prize) tiers. */
export const CRAZY_GATE_FLOOR: LeagueTier = 'diamond'

export const CRAZY_LEAGUE_PRIZE_LABEL = 'up to ₹5,000'

export const CRAZY_GATE_COPY = {
  short: 'Crazy League (prize money up to ₹5,000) requires the 12-month plan.',
  long:
    'Consistency League entry is free with every coaching plan — certificates and trophies included. Crazy League, where top finishers can win prize money up to ₹5,000, is reserved for members on the 12-month plan.',
  upgradeCta: 'Unlock Crazy League with the 12-month plan',
  upgradeHref: '/plans/12-months',
} as const

export function isCrazyLeagueTier(tier: LeagueTier | null | undefined): boolean {
  return tier === 'crazy_1' || tier === 'crazy_2' || tier === 'crazy_3'
}

/** True when the client’s active coaching plan is the 12-month catalog SKU. */
export function isCrazyLeagueEligible(planSlug: string | null | undefined): boolean {
  if (!planSlug) return false
  const plan = getCoachingPlan(planSlug)
  return plan?.slug === '12_months' && plan.durationMonths >= 12
}

/**
 * Hard clamp: non–12-month members cannot sit in Crazy tiers.
 * Returns diamond (last free tier) when blocked.
 */
export function clampDivisionForCrazyEligibility(
  division: LeagueTier,
  crazyEligible: boolean
): LeagueTier {
  if (!crazyEligible && isCrazyLeagueTier(division)) return CRAZY_GATE_FLOOR
  return division
}

/** Next division after promotion, or null if blocked / top of ladder. */
export function nextEligibleLeagueDivision(
  current: LeagueTier,
  crazyEligible: boolean
): { next: LeagueTier | null; blockedByCrazyGate: boolean } {
  const ladder: LeagueTier[] = [
    'bronze',
    'silver',
    'gold',
    'platinum',
    'diamond',
    'crazy_1',
    'crazy_2',
    'crazy_3',
  ]
  const idx = ladder.indexOf(current === 'world' ? 'crazy_3' : current)
  if (idx < 0 || idx >= ladder.length - 1) {
    return { next: null, blockedByCrazyGate: false }
  }
  const next = ladder[idx + 1]
  if (isCrazyLeagueTier(next) && !crazyEligible) {
    return { next: null, blockedByCrazyGate: true }
  }
  return { next, blockedByCrazyGate: false }
}

export function planSlugIsTwelveMonth(slug: CoachingPlanSlug | string | null | undefined): boolean {
  return isCrazyLeagueEligible(slug)
}
