function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function canUseWebPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && Notification.permission !== 'denied'
}

export async function enableWebPush(): Promise<boolean> {
  if (!canUseWebPush()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const config = await fetch('/api/notifications/push-subscription').then((response) => response.json())
  if (!config.publicKey) return false
  const registration = await navigator.serviceWorker.register('/notification-sw.js', { scope: '/' })
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(config.publicKey),
  })
  const response = await fetch('/api/notifications/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })
  return response.ok
}
