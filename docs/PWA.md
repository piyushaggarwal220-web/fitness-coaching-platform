# Lurvox Progressive Web App

Stack: **Next.js App Router** + a single root service worker + **Web Push (VAPID)**.

## What ships

| Piece | Location |
|-------|----------|
| Manifest | `/public/manifest.webmanifest` and `/public/manifest.json` (same payload) |
| Service worker | `/public/notification-sw.js` (scope `/`) |
| Offline fallback | `/public/offline.html` |
| Icons | `/public/icons/icon-192.png`, `icon-512.png` |
| Head / metadata | `src/app/layout.tsx` (`manifest`, `themeColor`, `appleWebApp`, icons) |
| SW registration + install capture | `src/components/pwa/PwaRegister.tsx` |
| Mobile install prompt | `src/components/pwa/PwaInstallPrompt.tsx` (client + coach dashboards) |
| Profile install card | `src/components/pwa/InstallAppCard.tsx` |
| Push (Android + desktop) | Web Push via `web-push` + VAPID — not Firebase |

## Caching strategy (`notification-sw.js`)

1. **Shell precache** — offline page, manifests, icons  
2. **Static assets** — `/_next/static/*`, images, fonts → stale-while-revalidate  
3. **Key pages** — dashboard, plan, tracker, check-in, profile, coach, etc. → network-first with cache fallback  
4. **Never cached** — `/api/*`, `/auth*`, `/admin*`

## Push notifications (Android + desktop)

This app uses the **standard Web Push API** with VAPID keys (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

That is the correct browser path for Chrome/Edge/Firefox on **Android and desktop**. Firebase Cloud Messaging is not wired because FCM for web still ends at a service worker + push subscription, and migrating would break the existing `push_subscriptions` outbox pipeline.

Enable flow: user grants permission → SW `pushManager.subscribe` → `POST /api/notifications/push-subscription` → server delivers via `web-push`.

See also `docs/notification-delivery.md`.

## Install prompt

- Captures `beforeinstallprompt` early in the root layout  
- Shows on mobile (iOS Share sheet tips, Android native Install, or manual Chrome menu)  
- Once per 24h after dismiss  
- Always available from Profile → Install app card  

## Verify

```bash
npm run verify:pwa
npm run verify:notifications
```
