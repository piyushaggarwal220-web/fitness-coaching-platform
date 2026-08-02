/**
 * Structural checks for Lurvox PWA wiring (no browser required).
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

assert.ok(existsSync(path.join(root, 'public/manifest.webmanifest')), 'manifest.webmanifest exists')
assert.ok(existsSync(path.join(root, 'public/manifest.json')), 'manifest.json exists')
assert.ok(existsSync(path.join(root, 'public/notification-sw.js')), 'service worker exists')
assert.ok(existsSync(path.join(root, 'public/offline.html')), 'offline.html exists')
assert.ok(existsSync(path.join(root, 'public/icons/icon-192.png')), 'icon-192 exists')
assert.ok(existsSync(path.join(root, 'public/icons/icon-512.png')), 'icon-512 exists')

const webManifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name?: string
  short_name?: string
  display?: string
  theme_color?: string
  icons?: unknown[]
  start_url?: string
}
const jsonManifest = JSON.parse(read('public/manifest.json')) as typeof webManifest

assert.equal(webManifest.display, 'standalone', 'manifest display standalone')
assert.equal(jsonManifest.display, 'standalone', 'manifest.json display standalone')
assert.ok(webManifest.name?.trim(), 'manifest has name')
assert.ok(webManifest.theme_color?.trim(), 'manifest has theme_color')
assert.ok((webManifest.icons?.length ?? 0) >= 2, 'manifest has icons')
assert.equal(webManifest.start_url, jsonManifest.start_url, 'manifest files stay in sync')

const sw = read('public/notification-sw.js')
assert.match(sw, /SHELL_CACHE|lurvox-shell/, 'SW defines shell cache')
assert.match(sw, /STATIC_CACHE|lurvox-static/, 'SW defines static cache')
assert.match(sw, /PAGE_CACHE|lurvox-pages/, 'SW defines page cache')
assert.match(sw, /addEventListener\('push'/, 'SW handles push')
assert.match(sw, /addEventListener\('notificationclick'/, 'SW handles notification click')
assert.match(sw, /KEY_PAGE_PREFIXES/, 'SW caches key pages')
assert.match(sw, /_next\/static/, 'SW caches Next static assets')
assert.doesNotMatch(sw, /firebase/i, 'SW does not depend on Firebase')

const layout = read('src/app/layout.tsx')
assert.match(layout, /manifest:\s*["']\/manifest\.webmanifest["']/, 'layout links manifest')
assert.match(layout, /themeColor/, 'layout sets themeColor')
assert.match(layout, /appleWebApp/, 'layout sets appleWebApp')
assert.match(layout, /PwaRegister/, 'layout registers SW')

const pwaRegister = read('src/components/pwa/PwaRegister.tsx')
assert.match(pwaRegister, /notification-sw\.js/, 'PwaRegister points at SW')
assert.match(pwaRegister, /bindInstallPromptCapture/, 'PwaRegister captures install prompt')

const installPrompt = read('src/components/pwa/PwaInstallPrompt.tsx')
assert.match(installPrompt, /shouldOfferHomeScreenInstall|beforeinstallprompt|Install/, 'install prompt present')

const webPushClient = read('src/lib/notifications/web-push-client.ts')
assert.match(webPushClient, /PushManager/, 'web push client uses PushManager')
assert.match(webPushClient, /VAPID|applicationServerKey|pushManager\.subscribe/, 'web push uses VAPID subscribe path')

const nextConfig = read('next.config.ts')
assert.match(nextConfig, /notification-sw\.js/, 'next.config sets SW headers')
assert.match(nextConfig, /manifest\.json/, 'next.config serves manifest.json')

const middleware = read('middleware.ts')
assert.match(middleware, /manifest\.json/, 'middleware bypasses manifest.json')
assert.match(middleware, /notification-sw\.js/, 'middleware bypasses SW')

console.log('All PWA structural checks passed')
