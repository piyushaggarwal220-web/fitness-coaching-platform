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
assert.ok(existsSync(path.join(root, 'public/icon-192.png')), 'icon-192 exists at /icon-192.png')
assert.ok(existsSync(path.join(root, 'public/icon-512.png')), 'icon-512 exists at /icon-512.png')

const webManifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name?: string
  short_name?: string
  description?: string
  display?: string
  theme_color?: string
  background_color?: string
  icons?: { src?: string; sizes?: string }[]
  start_url?: string
}
const jsonManifest = JSON.parse(read('public/manifest.json')) as typeof webManifest

assert.equal(webManifest.display, 'standalone', 'manifest display standalone')
assert.equal(jsonManifest.display, 'standalone', 'manifest.json display standalone')
assert.equal(webManifest.name, 'Lurvox', 'manifest name')
assert.equal(webManifest.short_name, 'Lurvox', 'manifest short_name')
assert.equal(webManifest.start_url, '/dashboard', 'manifest start_url stays on Next app')
assert.equal(webManifest.theme_color, '#15110D', 'manifest theme_color')
assert.equal(webManifest.background_color, '#15110D', 'manifest background_color')
assert.match(
  webManifest.description ?? '',
  /Personal fitness coaching/,
  'manifest description'
)
assert.ok((webManifest.icons?.length ?? 0) >= 2, 'manifest has icons')
assert.equal(webManifest.icons?.[0]?.src, '/icon-192.png', '192 icon path')
assert.equal(webManifest.icons?.[1]?.src, '/icon-512.png', '512 icon path')
assert.deepEqual(webManifest, jsonManifest, 'manifest files stay in sync')

const sw = read('public/notification-sw.js')
assert.match(sw, /SHELL_CACHE|lurvox-shell/, 'SW defines shell cache')
assert.match(sw, /STATIC_CACHE|lurvox-static/, 'SW defines static cache')
assert.match(sw, /PAGE_CACHE|lurvox-pages/, 'SW defines page cache')
assert.match(sw, /addEventListener\('push'/, 'SW handles push')
assert.match(sw, /addEventListener\('notificationclick'/, 'SW handles notification click')
assert.match(sw, /KEY_PAGE_PREFIXES/, 'SW caches key pages')
assert.match(sw, /_next\//, 'SW mentions Next build assets')
assert.match(
  sw,
  /Do not cache\/intercept hashed Next\.js build assets|pathname\.startsWith\('\/_next\//,
  'SW bypasses hashed Next build assets so deploys do not break open tabs'
)
assert.doesNotMatch(sw, /firebase/i, 'SW does not depend on Firebase')

const chunkRecovery = read('src/components/pwa/ChunkLoadRecovery.tsx')
assert.match(chunkRecovery, /reloadForNewDeployment/, 'chunk recovery reloads after stale deploy')

const layout = read('src/app/layout.tsx')
assert.match(layout, /manifest:\s*["']\/manifest\.json["']/, 'layout links manifest.json')
assert.match(layout, /themeColor/, 'layout sets themeColor')
assert.match(layout, /appleWebApp/, 'layout sets appleWebApp')
assert.match(layout, /PwaRegister/, 'layout registers SW')
assert.match(layout, /ChunkLoadRecovery/, 'layout recovers from stale Next chunks')

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
