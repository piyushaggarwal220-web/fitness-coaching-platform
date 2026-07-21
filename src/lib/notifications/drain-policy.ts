export const IMMEDIATE_DRAIN_LIMIT = 4
export const OPPORTUNISTIC_DRAIN_LIMIT = 5
export const OPPORTUNISTIC_LEASE_SECONDS = 30
export const DAILY_RECONCILIATION_LIMIT = 100

export type DrainPlan =
  | { mode: 'immediate'; limit: number; eventId: string; requiresLease: false }
  | { mode: 'opportunistic'; limit: number; eventId: null; requiresLease: true; leaseSeconds: number }

export function notificationDrainPlan(mode: 'immediate', eventId: string): DrainPlan
export function notificationDrainPlan(mode: 'opportunistic'): DrainPlan
export function notificationDrainPlan(mode: 'immediate' | 'opportunistic', eventId?: string): DrainPlan {
  if (mode === 'immediate') {
    if (!eventId) throw new Error('Immediate notification drains require an event ID')
    return { mode, limit: IMMEDIATE_DRAIN_LIMIT, eventId, requiresLease: false }
  }
  return {
    mode,
    limit: OPPORTUNISTIC_DRAIN_LIMIT,
    eventId: null,
    requiresLease: true,
    leaseSeconds: OPPORTUNISTIC_LEASE_SECONDS,
  }
}

export function isHobbyCompatibleDailyCron(schedule: string): boolean {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields
  return /^\d+$/.test(minute)
    && /^\d+$/.test(hour)
    && dayOfMonth === '*'
    && month === '*'
    && dayOfWeek === '*'
}
