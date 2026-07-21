import { createAdminClient } from '@/lib/supabase/admin'
import { safeInternalPathOrNull } from '@/lib/safe-navigation'
import type { NotificationType, UserNotification } from '@/types/database'
import { createHash } from 'node:crypto'

export type NotificationPayload = {
  userId: string
  type: NotificationType
  title: string
  body: string
  actionUrl?: string
  metadata?: Record<string, unknown>
  idempotencyKey?: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
}

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'web_push'

export type ChannelProvider = {
  channel: NotificationChannel
  send: (payload: NotificationPayload & { notificationId: string }) => Promise<{ ok: boolean; error?: string }>
}

const channelProviders: ChannelProvider[] = []

export function registerChannelProvider(provider: ChannelProvider): void {
  const idx = channelProviders.findIndex((p) => p.channel === provider.channel)
  if (idx >= 0) channelProviders[idx] = provider
  else channelProviders.push(provider)
}

function defaultIdempotencyKey(payload: NotificationPayload): string {
  const identifiers = ['messageId', 'checkinId', 'callRequestId', 'planId', 'purchaseId']
    .map((key) => payload.metadata?.[key])
    .filter(Boolean)
    .join(':')
  const bucket = Math.floor(Date.now() / (5 * 60_000))
  const source = `${payload.userId}:${payload.type}:${identifiers || bucket}:${payload.title}:${payload.actionUrl ?? ''}`
  return `notification:${createHash('sha256').update(source).digest('hex')}`
}

/** Persist an event, create in-app delivery immediately, and queue every other channel. */
export async function sendNotification(payload: NotificationPayload): Promise<UserNotification | null> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const actionUrl = safeInternalPathOrNull(payload.actionUrl ?? null)
  const idempotencyKey = payload.idempotencyKey?.trim() || defaultIdempotencyKey(payload)

  const { data: eventId, error: enqueueError } = await admin.rpc('enqueue_notification_event', {
    p_user_id: payload.userId,
    p_event_type: payload.type,
    p_title: payload.title,
    p_body: payload.body,
    p_action_url: actionUrl,
    p_metadata: payload.metadata ?? {},
    p_idempotency_key: idempotencyKey,
    p_priority: payload.priority ?? null,
  })

  if (enqueueError || !eventId) {
    console.error('[notifications] Failed to enqueue event:', enqueueError?.message)
    return null
  }

  const { data, error } = await admin
    .from('user_notifications')
    .upsert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      action_url: actionUrl,
      metadata: payload.metadata ?? null,
      delivery_event_id: eventId,
      created_at: now,
    }, { onConflict: 'delivery_event_id' })
    .select()
    .single()

  if (error || !data) {
    console.error('[notifications] Failed to create notification:', error?.message)
    return null
  }

  const notification = data as UserNotification

  await Promise.all([
    admin.from('notification_events').update({ in_app_notification_id: notification.id }).eq('id', eventId),
    admin.from('notification_jobs').update({
      state: 'delivered',
      sent_at: now,
      delivered_at: now,
      updated_at: now,
    }).eq('event_id', eventId).eq('channel', 'in_app'),
  ])

  return notification
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const admin = createAdminClient()
  const readAt = new Date().toISOString()
  const { data } = await admin
    .from('user_notifications')
    .update({ read_at: readAt })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('delivery_event_id')
    .maybeSingle()
  if (data?.delivery_event_id) {
    await admin.from('notification_jobs').update({ read_at: readAt }).eq('event_id', data.delivery_event_id)
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const admin = createAdminClient()
  const readAt = new Date().toISOString()
  await admin
    .from('user_notifications')
    .update({ read_at: readAt })
    .eq('user_id', userId)
    .is('read_at', null)
  await admin
    .from('notification_jobs')
    .update({ read_at: readAt })
    .eq('user_id', userId)
    .is('read_at', null)
}

export async function getUnreadCount(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  return count ?? 0
}

/** Notification templates for common events. */
export const NotificationTemplates = {
  planDelivered: (planTitle: string) => ({
    type: 'plan_delivered' as NotificationType,
    title: 'Your plan is ready!',
    body: `Your coaching plan "${planTitle}" has been delivered.`,
    actionUrl: '/plan',
    metadata: {
      messageSnippet: `Your coaching plan "${planTitle}" has been delivered.`,
    },
  }),
  coachAssigned: (coachName: string) => ({
    type: 'coach_assigned' as NotificationType,
    title: 'Coach assigned',
    body: `${coachName} is now your personal coach.`,
    actionUrl: '/dashboard',
  }),
  welcome: () => ({
    type: 'welcome' as NotificationType,
    title: 'Welcome to Lurvox!',
    body: 'Complete your onboarding to get your personalized plan.',
    actionUrl: '/onboarding',
  }),
  weeklyCheckinReminder: (opts?: { checkinLabel?: string; coachingWeek?: number }) => ({
    type: 'weekly_checkin_reminder' as NotificationType,
    title: 'Weekly check-in due',
    body: 'Time for your weekly progress check-in. Keep your coach updated!',
    actionUrl: '/checkin',
    metadata: {
      checkinType: 'weekly' as const,
      checkinLabel: opts?.checkinLabel ?? 'Weekly Check-in',
      coachingWeek: opts?.coachingWeek ?? null,
    },
  }),
  missedCheckin: () => ({
    type: 'missed_checkin' as NotificationType,
    title: 'Missed check-in',
    body: 'You missed your weekly check-in. Submit it when you can.',
    actionUrl: '/checkin',
    metadata: {
      checkinType: 'weekly' as const,
      checkinLabel: 'Weekly Check-in',
    },
  }),
  midWeekCheckinReminder: (opts?: { checkinLabel?: string; coachingWeek?: number }) => ({
    type: 'mid_week_checkin_reminder' as NotificationType,
    title: 'Mid-week check-in due',
    body: 'Complete your Day 3 accountability check-in for your coach.',
    actionUrl: '/checkin/mid-week',
    metadata: {
      checkinType: 'mid_week' as const,
      checkinLabel: opts?.checkinLabel ?? 'Mid-week Check-in',
      coachingWeek: opts?.coachingWeek ?? null,
    },
  }),
  checkinSubmitted: (clientName: string, checkinType: 'mid_week' | 'weekly') => ({
    type: 'checkin_submitted' as NotificationType,
    title: checkinType === 'mid_week' ? 'Mid-week check-in submitted' : 'Weekly check-in submitted',
    body: `${clientName} submitted a ${checkinType === 'mid_week' ? 'Day 3' : 'weekly'} check-in for review.`,
    actionUrl: '/coach/checkins',
  }),
  planAvailable: () => ({
    type: 'plan_available' as NotificationType,
    title: 'New plan available',
    body: 'Your coach has prepared an updated plan for you.',
    actionUrl: '/plan',
    metadata: {
      messageSnippet: 'Your coach has prepared an updated plan for you.',
    },
  }),
  progressMilestone: (milestone: string) => ({
    type: 'progress_milestone' as NotificationType,
    title: 'Milestone achieved!',
    body: milestone,
    actionUrl: '/journey',
  }),
  issueUpdate: (status: string) => ({
    type: 'issue_update' as NotificationType,
    title: 'Issue report updated',
    body: `Your report status is now: ${status}`,
    actionUrl: '/client/report-issue',
  }),
}
