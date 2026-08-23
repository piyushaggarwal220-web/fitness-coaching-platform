/**
 * Draft polish: visible how/compare CTAs, hero → #plans, single prices, no closer dupes.
 * Theme: 161454620923 only.
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

async function put(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${key}: ${res.status} ${text.slice(0, 500)}`)
  console.log('uploaded', key)
}

async function get(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`get ${key}: ${res.status}`)
  return json.asset.value
}

const files = [
  ['snippets/lurvox-home-flow.liquid', 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'],
  ['blocks/ai_gen_block_52353f6.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_52353f6.liquid'],
  ['blocks/ai_gen_block_361650c.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'],
]

for (const [key, rel] of files) {
  await put(key, fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

const tpl = JSON.parse(await get('templates/index.json'))
const section = tpl.sections.home_blocks_v2
if (section?.blocks?.lurvox_plans_anchor) {
  section.blocks.lurvox_plans_anchor.settings.custom_liquid =
    '<div id="plans" style="scroll-margin-top:96px;height:1px;"></div>'
}
await put('templates/index.json', JSON.stringify(tpl))
console.log('done')
console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=btnvis2`)
