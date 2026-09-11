/** Shared timing helpers for 12-month weekly call scheduling (safe for client + scripts). */

const DAY_MS = 24 * 60 * 60 * 1000
const INDIA_TIME_OFFSET_MS = (5 * 60 + 30) * 60 * 1000

/** Wait through the first coaching week before the first weekly call opens. */
export const INITIAL_WEEKLY_CALL_DELAY_MS = 7 * DAY_MS

/** Saturday 11:00 IST — default auto-booked weekly call slot. */
export const DEFAULT_CALL_WEEKDAY = 6
export const DEFAULT_CALL_HOUR_IST = 11

const IST_WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function getIstWeekday(date: Date): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(date)
  return IST_WEEKDAY[label] ?? 0
}

function getIstYmd(date: Date): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return {
    y: Number(parts.find((p) => p.type === 'year')?.value),
    mo: Number(parts.find((p) => p.type === 'month')?.value),
    d: Number(parts.find((p) => p.type === 'day')?.value),
  }
}

/** Midnight-local IST expressed as UTC. */
function utcFromIstLocal(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, 0, 0) - INDIA_TIME_OFFSET_MS)
}

/**
 * Auto weekly call opens after the first coaching week (7 days from schedule start).
 * Daily cron + ensure callers create the call once that window has passed.
 */
export function getInitialWeeklyCallWindow(
  scheduleStartedAt: string | Date,
  now = new Date()
): { earliestAfter: Date; eligible: boolean } {
  const started = new Date(scheduleStartedAt)
  if (Number.isNaN(started.getTime())) {
    return { earliestAfter: now, eligible: false }
  }
  const earliestAfter = new Date(started.getTime() + INITIAL_WEEKLY_CALL_DELAY_MS)
  return {
    earliestAfter,
    eligible: now.getTime() >= earliestAfter.getTime(),
  }
}

/** Next preferred weekday + hour (IST) at least 1 hour from `after`. */
export function computeNextCallSlotUtc(
  preferredWeekday = DEFAULT_CALL_WEEKDAY,
  preferredHourIst = DEFAULT_CALL_HOUR_IST,
  after = new Date()
): Date {
  const minMs = after.getTime() + 60 * 60 * 1000
  const start = new Date(after)
  for (let i = 0; i < 21; i++) {
    const probe = new Date(start.getTime() + i * 86_400_000)
    if (getIstWeekday(probe) !== preferredWeekday) continue
    const { y, mo, d } = getIstYmd(probe)
    const slot = utcFromIstLocal(y, mo, d, preferredHourIst, 0)
    if (slot.getTime() >= minMs) return slot
  }
  return new Date(minMs + 7 * 86_400_000)
}

export function computeFollowingWeeklySlot(
  previousScheduledFor: string,
  preferredWeekday = DEFAULT_CALL_WEEKDAY,
  preferredHourIst = DEFAULT_CALL_HOUR_IST
): Date {
  const prev = new Date(previousScheduledFor)
  if (!Number.isNaN(prev.getTime())) {
    const next = new Date(prev.getTime() + 7 * 86_400_000)
    if (next.getTime() > Date.now() + 60 * 60 * 1000) return next
  }
  return computeNextCallSlotUtc(preferredWeekday, preferredHourIst)
}

/** Book this exact instant when it is already a future slot; otherwise find the next preferred weekday. */
export function resolveBookedWeeklySlot(input: {
  preferredWeekday?: number | null
  preferredHourIst?: number | null
  after?: Date | null
  now?: Date
}): Date {
  const weekday =
    typeof input.preferredWeekday === 'number' &&
    input.preferredWeekday >= 0 &&
    input.preferredWeekday <= 6
      ? input.preferredWeekday
      : DEFAULT_CALL_WEEKDAY
  const hour =
    typeof input.preferredHourIst === 'number' &&
    input.preferredHourIst >= 0 &&
    input.preferredHourIst <= 23
      ? input.preferredHourIst
      : DEFAULT_CALL_HOUR_IST
  const now = input.now ?? new Date()
  const after = input.after
  if (after && after.getTime() > now.getTime() + 60 * 60 * 1000) {
    return after
  }
  return computeNextCallSlotUtc(weekday, hour, after && after.getTime() > now.getTime() ? after : now)
}

export function formatCallSlotIst(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
