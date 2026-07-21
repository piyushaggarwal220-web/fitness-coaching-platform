'use client'

export type WebPushStatus =
  | 'checking'
  | 'enabled'
  | 'not-enabled'
  | 'blocked'
  | 'unsupported'

export const WEB_PUSH_STATUS_CHANGED_EVENT = 'web-push-status-changed'

export function resolveWebPushStatus(
  supported: boolean,
  permission: NotificationPermission,
  subscribed: boolean
): WebPushStatus {
  if (!supported) return 'unsupported'
  if (permission === 'denied') return 'blocked'
  return permission === 'granted' && subscribed ? 'enabled' : 'not-enabled'
}

export function canUseWebPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new Uint8Array(bytes.buffer)
}

async function notificationRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/notification-sw.js', { scope: '/' })
  return navigator.serviceWorker.ready
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (!canUseWebPush()) return 'unsupported'

  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = registration
      ? await registration.pushManager.getSubscription()
      : null
    if (!subscription || Notification.permission !== 'granted') {
      return resolveWebPushStatus(true, Notification.permission, false)
    }

    const response = await fetch('/api/notifications/push-subscription', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    const result = await response.json().catch(() => null) as {
      registered?: boolean
    } | null
    return resolveWebPushStatus(
      true,
      Notification.permission,
      response.ok && result?.registered === true
    )
  } catch {
    return resolveWebPushStatus(true, Notification.permission, false)
  }
}

export async function enableWebPush(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!canUseWebPush()) {
    return {
      ok: false,
      error: 'Push notifications are not supported in this browser.',
    }
  }

  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
    if (permission !== 'granted') {
      return {
        ok: false,
        error: permission === 'denied'
          ? 'Notifications are blocked. Allow them in your browser or device settings.'
          : 'Notification permission was not enabled.',
      }
    }

    const keyResponse = await fetch('/api/notifications/push-subscription', {
      credentials: 'include',
    })
    const keyResult = await keyResponse.json().catch(() => null) as {
      publicKey?: string | null
      error?: string
    } | null
    if (!keyResponse.ok || !keyResult?.publicKey) {
      return {
        ok: false,
        error: keyResult?.error ?? 'Push notifications are not configured.',
      }
    }

    const registration = await notificationRegistration()
    const existing = await registration.pushManager.getSubscription()
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(keyResult.publicKey),
    })
    const saveResponse = await fetch('/api/notifications/push-subscription', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    })
    const saveResult = await saveResponse.json().catch(() => null) as {
      error?: string
    } | null
    if (!saveResponse.ok) {
      return {
        ok: false,
        error: saveResult?.error ?? 'Could not save this notification subscription.',
      }
    }

    window.dispatchEvent(new Event(WEB_PUSH_STATUS_CHANGED_EVENT))
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'Could not enable push notifications.',
    }
  }
}
