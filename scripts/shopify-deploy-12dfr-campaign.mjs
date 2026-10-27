/**
 * Copy the campaign homepage onto unpublished theme "12dfr" only.
 * Does not publish.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 187792523515
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const IMAGES = [
  ['assets/lurvox-cast-hero.webp', 'public/images/lurvox/campaign/hero-male.webp'],
  ['assets/lurvox-cast-fat-loss.webp', 'public/images/lurvox/campaign/goal-fat-loss.webp'],
  ['assets/lurvox-cast-muscle.webp', 'public/images/lurvox/campaign/goal-muscle.webp'],
  ['assets/lurvox-cast-athletic.webp', 'public/images/lurvox/campaign/goal-athletic.webp'],
  ['assets/lurvox-cast-train.webp', 'public/images/lurvox/campaign/train.webp'],
  ['assets/lurvox-cast-eat.webp', 'public/images/lurvox/campaign/eat.webp'],
  ['assets/lurvox-cast-recover.webp', 'public/images/lurvox/campaign/recover.webp'],
  ['assets/lurvox-coach-piyush.png', 'public/landing/instant-coach-piyush.png'],
  ['assets/lurvox-coach-rakshit.png', 'public/landing/instant-coach-rakshit.png'],
]

async function putAsset(asset) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PUT ${asset.key}: ${res.status} ${text.slice(0, 400)}`)
  console.log('uploaded', asset.key)
}

async function getText(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${key}: ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text).asset.value
}

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const theme = (themes.themes || []).find((item) => item.id === THEME_ID)
if (!theme || theme.name !== '12dfr' || theme.role === 'main') {
  throw new Error(`Refusing to write. Found ${theme?.name} role=${theme?.role}`)
}

for (const [key, rel] of IMAGES) {
  const buffer = fs.readFileSync(path.join(ROOT, rel))
  await putAsset({ key, attachment: buffer.toString('base64') })
}

await putAsset({
  key: 'sections/lurvox-campaign.liquid',
  value: fs.readFileSync(
    path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-campaign.liquid'),
    'utf8'
  ),
})

const index = JSON.parse(await getText('templates/index.json'))
index.sections.lurvox_campaign = { type: 'lurvox-campaign', settings: {} }
const hide = [
  'lurvox_offer_home',
  'lurvox_landing_hero',
  'home_blocks_v2',
  'lurvox_home_gallery',
  'blocks_fqanJt',
  '17845381649d72a415',
]
for (const id of hide) {
  if (index.sections[id]) index.sections[id].disabled = true
}
const keep = (index.order || []).filter((id) => id !== 'lurvox_campaign')
index.order = ['lurvox_campaign', ...keep]
await putAsset({ key: 'templates/index.json', value: `${JSON.stringify(index, null, 2)}\n` })

console.log('theme', theme.name, theme.role, THEME_ID)
console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}`)
