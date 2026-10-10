/**
 * Auto-delivered plans (customised digital plans and auto-coach initial plans)
 * stay held after onboarding, then go out once — between 1 and 2 hours.
 * The same instant is what the client dashboard counts down to.
 *
 * Cron that releases a held plan runs every 15 minutes, so the scheduled
 * instant stops 15 minutes before the 2-hour mark. The release still lands
 * inside 2 hours.
 */

export const INSTANT_PLAN_MIN_MS = 60 * 60 * 1000
export const INSTANT_PLAN_MAX_MS = 2 * 60 * 60 * 1000
export const INSTANT_PLAN_CRON_SLACK_MS = 15 * 60 * 1000

/** Client-facing window. Dashboard, checkout, and emails use this same phrase. */
export const INSTANT_PLAN_WINDOW_LABEL = '1–2 hours'

export function instantPlanDelayMs(clientId: string): number {
  const earliest = INSTANT_PLAN_MIN_MS
  const latest = INSTANT_PLAN_MAX_MS - INSTANT_PLAN_CRON_SLACK_MS
  let hash = 2166136261
  for (let i = 0; i < clientId.length; i += 1) {
    hash ^= clientId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const span = latest - earliest
  return earliest + ((hash >>> 0) % (span + 1))
}

/** Exact send time for this client. Null when onboarding has no completion time. */
export function instantPlanDeliverAt(
  onboardingCompletedAt: string | Date | null | undefined,
  clientId: string
): Date | null {
  if (!clientId || !onboardingCompletedAt) return null
  const start =
    onboardingCompletedAt instanceof Date
      ? onboardingCompletedAt
      : new Date(onboardingCompletedAt)
  const startMs = start.getTime()
  if (!Number.isFinite(startMs)) return null
  return new Date(startMs + instantPlanDelayMs(clientId))
}

export function instantPlanWindowOpen(
  onboardingCompletedAt: string | Date | null | undefined,
  clientId: string,
  now: Date = new Date()
): boolean {
  const at = instantPlanDeliverAt(onboardingCompletedAt, clientId)
  if (!at) return false
  return now.getTime() >= at.getTime()
}
