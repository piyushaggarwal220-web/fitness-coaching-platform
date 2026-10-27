/**
 * Replace the live lurvox.in homepage section.
 * Theme 187792523515 is the published main theme. Run only when asked to go live.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 187792523515
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

loadEnvLocal()

const tokenFile = fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')) : {}
let token = process.env.SHOPIFY_ACCESS_TOKEN || tokenFile.access_token || ''

if (!token && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
  const minted = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  })
  const mintedJson = await minted.json().catch(() => ({}))
  if (!minted.ok || !mintedJson.access_token) throw new Error(`Shopify client credentials failed (${minted.status})`)
  token = mintedJson.access_token
}

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const IMAGES = [
  ['assets/lurvox-2026-hero-fat-loss.webp', 'public/images/lurvox/campaign/hero-fat-loss.webp'],
  ['assets/lurvox-2026-hero-muscle.webp', 'public/images/lurvox/campaign/hero-muscle.webp'],
  ['assets/lurvox-2026-hero-athletic.webp', 'public/images/lurvox/campaign/hero-athletic.webp'],
  ['assets/lurvox-2026-training.webp', 'public/images/lurvox/campaign/training-session.webp'],
  ['assets/lurvox-2026-nutrition.webp', 'public/images/lurvox/campaign/nutrition-meal.webp'],
  ['assets/lurvox-2026-tracking.webp', 'public/images/lurvox/campaign/tracking-review.webp'],
  ['assets/lurvox-2026-checkin.webp', 'public/images/lurvox/campaign/weekly-checkin.webp'],
  ['assets/lurvox-2026-progress.webp', 'public/images/lurvox/campaign/progress-leave.webp'],
  ['assets/lurvox-2026-intake.webp', 'public/images/lurvox/campaign/intake-morning.webp'],
  ['assets/lurvox-2026-plan.webp', 'public/images/lurvox/campaign/plan-arrived.webp'],
  ['assets/lurvox-2026-why-plan.webp', 'public/images/lurvox/campaign/why-plan.webp'],
  ['assets/lurvox-2026-why-keeps.webp', 'public/images/lurvox/campaign/why-keeps.webp'],
  ['assets/lurvox-2026-why-principles.webp', 'public/images/lurvox/campaign/why-principles.webp'],
  ['assets/lurvox-2026-why-work.webp', 'public/images/lurvox/campaign/why-work.webp'],
  ['assets/lurvox-2026-method-work.webp', 'public/images/lurvox/campaign/method-work.webp'],
  ['assets/lurvox-2026-method-adapt.webp', 'public/images/lurvox/campaign/method-adapt.webp'],
  ['assets/lurvox-2026-coach-piyush.png', 'public/landing/instant-coach-piyush.png'],
  ['assets/lurvox-2026-coach-rakshit.png', 'public/landing/instant-coach-rakshit.png'],
  ['assets/lurvox-2026-coach-piyush-dark.webp', 'public/landing/coach-piyush-dark.webp'],
  ['assets/lurvox-2026-coach-rakshit-dark.webp', 'public/landing/coach-rakshit-dark.webp'],
  ['assets/lurvox-2026-app-videos.jpg', 'public/images/lurvox/app/videos.jpg'],
  ['assets/lurvox-2026-app-workout.jpg', 'public/images/lurvox/app/workout.jpg'],
  ['assets/lurvox-2026-app-diet.jpg', 'public/images/lurvox/app/diet.jpg'],
  ['assets/lurvox-2026-app-chat.jpg', 'public/images/lurvox/app/chat.jpg'],
  ['assets/lurvox-2026-client-01.jpg', 'public/images/lurvox/clients/01.jpg'],
  ['assets/lurvox-2026-client-02.jpg', 'public/images/lurvox/clients/02.jpg'],
  ['assets/lurvox-2026-client-03.jpg', 'public/images/lurvox/clients/03.jpg'],
  ['assets/lurvox-2026-client-04.jpg', 'public/images/lurvox/clients/04.jpg'],
  ['assets/lurvox-2026-client-05.jpg', 'public/images/lurvox/clients/05.jpg'],
  ['assets/lurvox-2026-client-06.jpg', 'public/images/lurvox/clients/06.jpg'],
  ['assets/lurvox-2026-client-07.jpg', 'public/images/lurvox/clients/07.jpg'],
]

async function putAsset(asset) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PUT ${asset.key}: ${res.status} ${text.slice(0, 300)}`)
  console.log('uploaded', asset.key)
}

let themeResponse = await fetch(`${API}/themes.json`, { headers })
if (themeResponse.status === 401) {
  if (tokenFile.refresh_token) {
    const refresh = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: tokenFile.refresh_token,
      }),
    })
    if (refresh.ok) {
      Object.assign(tokenFile, await refresh.json())
      fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
      headers['X-Shopify-Access-Token'] = tokenFile.access_token
      themeResponse = await fetch(`${API}/themes.json`, { headers })
    }
  }
  if (themeResponse.status === 401 && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
    const minted = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      }),
    })
    const mintedJson = await minted.json().catch(() => ({}))
    if (!minted.ok || !mintedJson.access_token) throw new Error(`Shopify client credentials failed (${minted.status})`)
    headers['X-Shopify-Access-Token'] = mintedJson.access_token
    themeResponse = await fetch(`${API}/themes.json`, { headers })
  }
}
const themes = await themeResponse.json()
if (!themeResponse.ok) {
  const detail = typeof themes.errors === 'string' ? themes.errors : JSON.stringify(themes.errors || themes).slice(0, 180)
  throw new Error(`Theme list failed ${themeResponse.status}: ${detail}`)
}
const theme = (themes.themes || []).find((item) => Number(item.id) === THEME_ID)
if (!theme || theme.role !== 'main' || theme.name !== '12dfr') {
  const listed = (themes.themes || []).map((item) => `${item.id}:${item.name}:${item.role}`).join(', ')
  throw new Error(`Refusing to write. Found ${theme?.name} role=${theme?.role}. Themes: ${listed}`)
}

for (const [key, rel] of IMAGES) {
  const buffer = fs.readFileSync(path.join(ROOT, rel))
  await putAsset({ key, attachment: buffer.toString('base64') })
}

await putAsset({
  key: 'sections/lurvox-campaign.liquid',
  value: fs.readFileSync(path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-campaign.liquid'), 'utf8'),
})

console.log('live', `https://www.lurvox.in/?v=${Date.now()}`)
