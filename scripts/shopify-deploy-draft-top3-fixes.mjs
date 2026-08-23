/**
 * Draft: top-3 new-visitor fixes — sticky hero, one primary CTA, float off plans.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function get(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`get ${key}: ${res.status} ${await res.text()}`)
  return (await res.json()).asset.value
}

async function put(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`put ${key}: ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

const files = [
  ['blocks/ai_gen_block_52353f6.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_52353f6.liquid'],
  ['snippets/lurvox-find-float.liquid', 'scripts/shopify-assets/snippets-lurvox-find-float.liquid'],
  ['snippets/lurvox-home-flow.liquid', 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'],
]

for (const [key, rel] of files) {
  await put(key, fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

const index = JSON.parse(await get('templates/index.json'))
const hero = index.sections?.home_blocks_v2?.blocks?.ai_gen_block_52353f6_MmHVRV
if (!hero?.settings) throw new Error('hero block missing')

hero.settings.headline_line_1 = "Personal workout + diet"
hero.settings.headline_line_2 = 'from a real coach.'
hero.settings.headline_highlight = 'Start in 90 days.'

await put('templates/index.json', `${JSON.stringify(index, null, 2)}\n`)

console.log('headline', hero.settings.headline_line_1, hero.settings.headline_line_2, hero.settings.headline_highlight)
console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=top3fix`)
