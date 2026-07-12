import type { NotificationPayload } from '@/lib/notifications/service'

/** Send a notification via the server API — safe for client components. */
export async function sendClientNotification(
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}
