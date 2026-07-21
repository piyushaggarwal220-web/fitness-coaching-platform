self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'LURVOX', body: 'You have a new notification.' }
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'LURVOX', {
    body: payload.body || 'You have a new notification.',
    tag: payload.tag || 'lurvox-notification',
    data: { actionUrl: payload.actionUrl || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.actionUrl || '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url === target)
    return existing ? existing.focus() : self.clients.openWindow(target)
  }))
})
