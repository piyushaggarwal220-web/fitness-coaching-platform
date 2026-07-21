import type { NotificationChannel } from '@/lib/notifications/service'
import type { NotificationType } from '@/types/database'

export type CostPolicy = {
  immediate: NotificationChannel[]
  escalation: NotificationChannel[]
  escalationDelayMinutes: number
  digestWindowMinutes: number
}

const DEFAULT_POLICY: CostPolicy = {
  immediate: ['in_app', 'web_push'],
  escalation: [],
  escalationDelayMinutes: 180,
  digestWindowMinutes: 0,
}

const COST_POLICIES: Partial<Record<NotificationType, CostPolicy>> = {
  coach_replied: { immediate: ['in_app', 'web_push'], escalation: [], escalationDelayMinutes: 720, digestWindowMinutes: 30 },
  unread_chat: { immediate: ['in_app', 'web_push'], escalation: ['whatsapp'], escalationDelayMinutes: 720, digestWindowMinutes: 30 },
  plan_delivered: { immediate: ['in_app', 'web_push'], escalation: ['whatsapp', 'email'], escalationDelayMinutes: 180, digestWindowMinutes: 0 },
  plan_available: { immediate: ['in_app', 'web_push'], escalation: ['whatsapp', 'email'], escalationDelayMinutes: 180, digestWindowMinutes: 0 },
  missed_checkin: { immediate: ['in_app', 'web_push'], escalation: ['whatsapp'], escalationDelayMinutes: 240, digestWindowMinutes: 0 },
}

export function getCostPolicy(type: NotificationType): CostPolicy {
  return COST_POLICIES[type] ?? DEFAULT_POLICY
}

export function selectChannels(type: NotificationType, unread: boolean): NotificationChannel[] {
  const policy = getCostPolicy(type)
  return unread ? [...policy.immediate, ...policy.escalation] : [...policy.immediate]
}

export function whatsappWithinCaps(input: {
  userToday: number
  userWeek: number
  globalMonth: number
  dailyCap: number
  weeklyCap: number
  monthlyCap: number
  circuitEnabled: boolean
}): boolean {
  return input.circuitEnabled
    && input.userToday < input.dailyCap
    && input.userWeek < input.weeklyCap
    && input.globalMonth < input.monthlyCap
}

export function digestBucket(userId: string, type: NotificationType, windowMinutes: number, nowMs: number): string | null {
  if (windowMinutes <= 0) return null
  return `${userId}:${type}:${Math.floor(nowMs / (windowMinutes * 60_000))}`
}
