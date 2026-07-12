import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationType, UserNotification } from '@/types/database'

export type NotificationPayload = {
  userId: string
  type: NotificationType
  title: string
  body: string
  actionUrl?: string
  metadata?: Record<string, unknown>
}

export type NotificationChannel = 'in_app' | 'email' | 'whatsapp' | 'push'

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

/** Create in-app notification and dispatch to registered channel providers. */
export async function sendNotification(payload: NotificationPayload): Promise<UserNotification | null> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await admin
    .from('user_notifications')
    .insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      action_url: payload.actionUrl ?? null,
      metadata: payload.metadata ?? null,
      created_at: now,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[notifications] Failed to create notification:', error?.message)
    return null
  }

  const notification = data as UserNotification

  for (const provider of channelProviders) {
    try {
      await provider.send({ ...payload, notificationId: notification.id })
    } catch (err) {
      console.error(`[notifications] ${provider.channel} dispatch failed:`, err)
    }
  }

  return notification
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
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
  weeklyCheckinReminder: () => ({
    type: 'weekly_checkin_reminder' as NotificationType,
    title: 'Weekly check-in due',
    body: 'Time for your weekly progress check-in. Keep your coach updated!',
    actionUrl: '/checkin',
  }),
  missedCheckin: () => ({
    type: 'missed_checkin' as NotificationType,
    title: 'Missed check-in',
    body: 'You missed your weekly check-in. Submit it when you can.',
    actionUrl: '/checkin',
  }),
  midWeekCheckinReminder: () => ({
    type: 'mid_week_checkin_reminder' as NotificationType,
    title: 'Mid-week check-in due',
    body: 'Complete your Day 3 accountability check-in for your coach.',
    actionUrl: '/checkin/mid-week',
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
