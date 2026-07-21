import 'server-only'
import { scheduleImmediateNotificationDrain } from '@/lib/notifications/drain'
import {
  NotificationTemplates,
  sendNotification as persistNotification,
} from '@/lib/notifications/service'
import type { NotificationPayload } from '@/lib/notifications/service'
import type { UserNotification } from '@/types/database'

/** Persist first, then best-effort drain this event after the response. */
export async function sendNotification(
  payload: NotificationPayload
): Promise<UserNotification | null> {
  const notification = await persistNotification(payload)
  const eventId = (notification as UserNotification & { delivery_event_id?: string } | null)
    ?.delivery_event_id
  if (eventId) scheduleImmediateNotificationDrain(eventId)
  return notification
}

export { NotificationTemplates }
