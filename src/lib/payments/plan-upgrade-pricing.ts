import {
  getCoachingPlan,
  subscriptionExpiryFromPlan,
  type CoachingPlan,
} from '@/lib/payments/plans'
import {
  isWithinPlanUpgradeWindow,
  PLAN_LATE_UPGRADE_FEE_INR,
} from '@/lib/payments/plan-upgrade-window'

/** ₹250, in paise. Coaching-ladder upgrades only, after the 48 hour window. */
export const PLAN_LATE_UPGRADE_FEE_PAISE = PLAN_LATE_UPGRADE_FEE_INR * 100

export type PlanUpgradeFamily = 'coaching' | 'duration' | 'digital'

const COACHING_RANK: Record<string, number> = {
  '1_week_trial': 0,
  '1_month': 1,
  '3_months': 2,
  '6_months': 3,
  '12_months': 4,
}

const DURATION_RANK: Record<string, number> = {
  offer_1_month: 1,
  offer_3_months: 2,
}

const DIGITAL_RANK: Record<string, number> = {
  digital_workout: 1,
  digital_diet: 1,
  digital_complete: 2,
}

export type HeldPlanForUpgrade = {
  slug: string
  planName: string
  netPaidPaise: number
  startsAt: Date
  accessEndsAt: Date
}

export type PlanUpgradeQuote = {
  applies: boolean
  payablePaise: number
  listAmountPaise: number
  creditPaise: number
  lateFeePaise: number
  fromSlug: string | null
  fromName: string | null
  anchorAt: Date | null
  covered: boolean
}

export type PlanUpgradeNote = {
  fromSlug: string
  creditPaise: number
  lateFeePaise: number
  anchorAt: string
}

export function planUpgradeFamily(slug: string | null | undefined): PlanUpgradeFamily | null {
  if (!slug) return null
  if (slug in COACHING_RANK) return 'coaching'
  if (slug in DURATION_RANK) return 'duration'
  if (slug in DIGITAL_RANK) return 'digital'
  return null
}

export function planUpgradeRank(slug: string | null | undefined): number | null {
  if (!slug) return null
  if (slug in COACHING_RANK) return COACHING_RANK[slug]
  if (slug in DURATION_RANK) return DURATION_RANK[slug]
  if (slug in DIGITAL_RANK) return DIGITAL_RANK[slug]
  return null
}

function planBySlug(slug: string): CoachingPlan | null {
  return getCoachingPlan(slug)
}

function labelForSlug(slug: string): string {
  return slug
    .split('+')
    .map((part) => planBySlug(part)?.name ?? part)
    .join(' + ')
}

/**
 * Leftover payable for a higher plan in the same family.
 * Credit is the published price of the plan they already hold, or the net cash
 * on that purchase when that cash is higher (legacy prices). Never above the
 * target price. Coaching upgrades add ₹250 after 48 hours, capped so the charge
 * cannot exceed buying the target plan on its own.
 */
export function quotePlanUpgrade(input: {
  held: readonly HeldPlanForUpgrade[]
  targetSlug: string
  targetListPaise: number
  now?: Date
}): PlanUpgradeQuote {
  const now = input.now ?? new Date()
  const list = input.targetListPaise
  const full: PlanUpgradeQuote = {
    applies: false,
    payablePaise: list,
    listAmountPaise: list,
    creditPaise: 0,
    lateFeePaise: 0,
    fromSlug: null,
    fromName: null,
    anchorAt: null,
    covered: false,
  }

  const family = planUpgradeFamily(input.targetSlug)
  const targetRank = planUpgradeRank(input.targetSlug)
  const target = planBySlug(input.targetSlug)
  if (!family || targetRank == null || !target || !Number.isInteger(list) || list <= 0) {
    return full
  }

  const activeLower = input.held.filter((row) => {
    if (planUpgradeFamily(row.slug) !== family) return false
    const rank = planUpgradeRank(row.slug)
    if (rank == null || rank >= targetRank) return false
    if (!(row.accessEndsAt instanceof Date) || Number.isNaN(row.accessEndsAt.getTime())) return false
    return row.accessEndsAt.getTime() > now.getTime()
  })

  if (activeLower.length === 0) return full

  let credit = 0
  let fromSlug: string
  let anchorAt: Date

  if (family === 'digital') {
    const bySlug = new Map<string, { credit: number; startsAt: Date }>()
    for (const row of activeLower) {
      const catalog = planBySlug(row.slug)?.amountPaise ?? 0
      const rowCredit = Math.max(catalog, Math.max(0, row.netPaidPaise))
      const prev = bySlug.get(row.slug)
      if (!prev || rowCredit > prev.credit) {
        bySlug.set(row.slug, { credit: rowCredit, startsAt: row.startsAt })
      }
    }
    credit = Math.min(list, [...bySlug.values()].reduce((sum, row) => sum + row.credit, 0))
    fromSlug = [...bySlug.keys()].sort().join('+')
    anchorAt = [...bySlug.values()].reduce(
      (earliest, row) => (row.startsAt.getTime() < earliest.getTime() ? row.startsAt : earliest),
      [...bySlug.values()][0].startsAt
    )
  } else {
    const best = [...activeLower].sort((a, b) => {
      const rankDelta = (planUpgradeRank(b.slug) ?? 0) - (planUpgradeRank(a.slug) ?? 0)
      if (rankDelta !== 0) return rankDelta
      return b.startsAt.getTime() - a.startsAt.getTime()
    })[0]
    const catalog = planBySlug(best.slug)?.amountPaise ?? 0
    credit = Math.min(list, Math.max(catalog, Math.max(0, best.netPaidPaise)))
    fromSlug = best.slug
    anchorAt = best.startsAt
  }

  if (credit <= 0 || !fromSlug || !anchorAt) return full

  const lateFeePaise =
    family === 'coaching' && !isWithinPlanUpgradeWindow(anchorAt, now)
      ? PLAN_LATE_UPGRADE_FEE_PAISE
      : 0

  const raw = list - credit + lateFeePaise
  const payablePaise = Math.max(0, Math.min(list, raw))

  return {
    applies: true,
    payablePaise,
    listAmountPaise: list,
    creditPaise: credit,
    lateFeePaise,
    fromSlug,
    fromName: labelForSlug(fromSlug),
    anchorAt,
    covered: payablePaise === 0,
  }
}

/** Access end used when a profile expiry was never stored. */
export function computedAccessEnd(plan: CoachingPlan, startsAt: Date): Date {
  return subscriptionExpiryFromPlan(plan, startsAt)
}

export function formatPlanUpgradeNote(note: PlanUpgradeNote): string {
  return [note.fromSlug, note.creditPaise, note.lateFeePaise, note.anchorAt].join('|')
}

export function parsePlanUpgradeNote(raw: string | null | undefined): PlanUpgradeNote | null {
  if (!raw) return null
  const parts = raw.split('|')
  if (parts.length < 4) return null
  const fromSlug = parts[0]?.trim()
  const creditPaise = Number(parts[1])
  const lateFeePaise = Number(parts[2])
  const anchorAt = parts.slice(3).join('|').trim()
  if (!fromSlug || !anchorAt) return null
  if (!Number.isInteger(creditPaise) || creditPaise < 0) return null
  if (lateFeePaise !== 0 && lateFeePaise !== PLAN_LATE_UPGRADE_FEE_PAISE) return null
  if (Number.isNaN(new Date(anchorAt).getTime())) return null
  return { fromSlug, creditPaise, lateFeePaise, anchorAt }
}

/**
 * Payable amount encoded on a Razorpay order. Null when the note does not match
 * the target list (do not treat a bad note as ₹0).
 */
export function upgradePayableFromNote(
  listAmountPaise: number,
  note: PlanUpgradeNote | null
): number | null {
  if (!note) return null
  if (!Number.isInteger(listAmountPaise) || listAmountPaise <= 0) return null
  if (note.creditPaise > listAmountPaise) return null
  const raw = listAmountPaise - note.creditPaise + note.lateFeePaise
  const payable = Math.max(0, Math.min(listAmountPaise, raw))
  if (payable <= 0) return null
  return payable
}
