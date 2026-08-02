/* Lurvox service worker — push + instant shell / asset caching */

const CACHE_VERSION = 'v3'
const SHELL_CACHE = `lurvox-shell-${CACHE_VERSION}`
const STATIC_CACHE = `lurvox-static-${CACHE_VERSION}`
const PAGE_CACHE = `lurvox-pages-${CACHE_VERSION}`
const KNOWN_CACHES = new Set([SHELL_CACHE, STATIC_CACHE, PAGE_CACHE])

const SHELL_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

/** Key app routes kept for fast revisit / offline fallback (network-first). */
const KEY_PAGE_PREFIXES = [
  '/',
  '/dashboard',
  '/plan',
  '/tracker',
  '/checkin',
  '/profile',
  '/journey',
  '/chat',
  '/messages',
  '/coach',
  '/onboarding',
  '/login',
]

function isKeyPagePath(pathname) {
  if (pathname === '/') return true
  return KEY_PAGE_PREFIXES.some(
    (prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`))
  )
}

function isStaticAsset(pathname) {
  if (pathname.startsWith('/_next/static/')) return true
  if (pathname.startsWith('/icons/')) return true
  if (pathname.startsWith('/landing/')) return true
  return /\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|map)$/i.test(pathname)
}

function isShellAsset(pathname) {
  return SHELL_URLS.includes(pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !KNOWN_CACHES.has(key)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(cacheName)
    void cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        void cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached)

  return cached || networkPromise
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(PAGE_CACHE)
      void cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return (await caches.match('/offline.html')) || Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache API, auth, or admin traffic.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/admin')
  ) {
    return
  }

  if (request.mode === 'navigate') {
    if (isKeyPagePath(url.pathname)) {
      event.respondWith(networkFirstPage(request))
      return
    }

    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error())
    )
    return
  }

  if (isShellAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE))
    return
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE))
  }
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'LURVOX', body: 'You have a new notification.' }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'LURVOX', {
      body: payload.body || 'You have a new notification.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.tag || 'lurvox-notification',
      data: { actionUrl: payload.actionUrl || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.actionUrl || '/'
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === target || client.url.startsWith(target))
      if (existing) {
        return existing.focus()
      }
      return self.clients.openWindow(target)
    })
  )
})
