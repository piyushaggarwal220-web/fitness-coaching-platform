import {
  isCoachRoutingAddonSlug,
  maxCapturedPaidPaise,
  type PaidCoachPurchase,
} from '@/lib/coach-routing'
import {
  EXERCISE_VIDEOS_MONTHLY_ID,
  EXERCISE_VIDEOS_MONTHLY_PAISE,
} from '@/lib/payments/checkout-discounts'

/** Below this cash amount, videos are a 2-day trial then ₹69/month. ₹600+ stays included. */
export const EXERCISE_VIDEO_UNLIMITED_MIN_PAISE = 60_000
export const EXERCISE_VIDEO_TRIAL_DAYS = 2
export const EXERCISE_VIDEOS_MONTHLY_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export type ExerciseVideoPurchase = PaidCoachPurchase & {
  created_at?: string | null
}

export type ExerciseVideoAccessReason =
  | 'unlimited_paid'
  | 'lifetime_library'
  | 'trial'
  | 'monthly'
  | 'locked'

export type ExerciseVideoAccess = {
  allowed: boolean
  locked: boolean
  unlimited: boolean
  reason: ExerciseVideoAccessReason
  trialEndsAt: string | null
  accessUntil: string | null
  maxPaidPaise: number
  pricePaise: number
}

function parseCreatedAt(raw: string | null | undefined): number | null {
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

function isOpenProductPurchase(row: ExerciseVideoPurchase): boolean {
  const status = (row.status || '').toLowerCase()
  if (status !== 'captured' && status !== 'redeemed') return false
  if ((row.subscription_status || '').toLowerCase() === 'refunded') return false
  return !isCoachRoutingAddonSlug(row.plan_slug)
}

function firstProductPurchaseAtMs(rows: ExerciseVideoPurchase[]): number | null {
  let first: number | null = null
  for (const row of rows) {
    if (!isOpenProductPurchase(row)) continue
    const at = parseCreatedAt(row.created_at)
    if (at == null) continue
    if (first == null || at < first) first = at
  }
  return first
}

function monthlyAccessUntilMs(rows: ExerciseVideoPurchase[]): number | null {
  let latest: number | null = null
  for (const row of rows) {
    if ((row.plan_slug || '') !== EXERCISE_VIDEOS_MONTHLY_ID) continue
    if ((row.status || '').toLowerCase() !== 'captured') continue
    if ((row.subscription_status || '').toLowerCase() === 'refunded') continue
    const kept = Math.max(0, (Number(row.amount_paise) || 0) - (Number(row.refunded_amount_paise) || 0))
    if (kept <= 0) continue
    const at = parseCreatedAt(row.created_at)
    if (at == null) continue
    const until = at + EXERCISE_VIDEOS_MONTHLY_DAYS * DAY_MS
    if (latest == null || until > latest) latest = until
  }
  return latest
}

export function resolveExerciseVideoAccess(input: {
  nowMs?: number
  lifetimeLibrary: boolean
  purchases: ExerciseVideoPurchase[]
}): ExerciseVideoAccess {
  const nowMs = input.nowMs ?? Date.now()
  const maxPaidPaise = maxCapturedPaidPaise(input.purchases)
  const trialStartMs = firstProductPurchaseAtMs(input.purchases)
  const trialEndsMs = trialStartMs != null ? trialStartMs + EXERCISE_VIDEO_TRIAL_DAYS * DAY_MS : null
  const monthlyUntilMs = monthlyAccessUntilMs(input.purchases)

  const base = {
    trialEndsAt: trialEndsMs != null ? new Date(trialEndsMs).toISOString() : null,
    accessUntil: null as string | null,
    maxPaidPaise,
    pricePaise: EXERCISE_VIDEOS_MONTHLY_PAISE,
  }

  if (input.lifetimeLibrary) {
    return {
      ...base,
      allowed: true,
      locked: false,
      unlimited: true,
      reason: 'lifetime_library',
    }
  }

  if (maxPaidPaise >= EXERCISE_VIDEO_UNLIMITED_MIN_PAISE) {
    return {
      ...base,
      allowed: true,
      locked: false,
      unlimited: true,
      reason: 'unlimited_paid',
    }
  }

  if (trialEndsMs != null && nowMs < trialEndsMs) {
    return {
      ...base,
      allowed: true,
      locked: false,
      unlimited: false,
      reason: 'trial',
      accessUntil: base.trialEndsAt,
    }
  }

  if (monthlyUntilMs != null && nowMs < monthlyUntilMs) {
    return {
      ...base,
      allowed: true,
      locked: false,
      unlimited: false,
      reason: 'monthly',
      accessUntil: new Date(monthlyUntilMs).toISOString(),
    }
  }

  return {
    ...base,
    allowed: false,
    locked: true,
    unlimited: false,
    reason: 'locked',
    accessUntil: monthlyUntilMs != null ? new Date(monthlyUntilMs).toISOString() : base.trialEndsAt,
  }
}

export function publicExerciseVideoAccess(access: ExerciseVideoAccess) {
  return {
    locked: access.locked,
    entitled: access.allowed,
    unlimited: access.unlimited,
    reason: access.reason,
    trialEndsAt: access.trialEndsAt,
    accessUntil: access.accessUntil,
    pricePaise: access.pricePaise,
    freeUnlock: false,
    freeUsed: 0,
    freeRemaining: 0,
    freeCap: 0,
  }
}
