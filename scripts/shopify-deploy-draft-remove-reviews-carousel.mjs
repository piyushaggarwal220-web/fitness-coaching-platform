/**
 * Draft home: keep transformations under plans; remove Real People carousel.
 */
import fs from 'node:fs'
import path from 'node:path'

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

const REMOVE = 'ai_gen_block_a7d1b3c_hM7X88' // REAL PEOPLE, REAL RESULTS
const KEEP_TRANSFORM = 'ai_gen_block_cd3c949_6mqWVi'

const index = JSON.parse(await get('templates/index.json'))
const section = index.sections?.home_blocks_v2
if (!section?.blocks) throw new Error('home_blocks_v2 missing')

section.block_order = (section.block_order || []).filter((id) => id !== REMOVE)

if (section.blocks[REMOVE]) {
  section.blocks[REMOVE].disabled = true
}

// Ensure transformations sit right after after_plans (under plans)
const desired = [
  'ai_gen_block_52353f6_MmHVRV',
  'lurvox_what_you_get',
  'lurvox_home_find_cta',
  'lurvox_plans_anchor',
  'ai_gen_block_361650c_qqYKXh',
  'lurvox_home_after_plans',
  KEEP_TRANSFORM,
  'ai_gen_block_19d52f6_xE8YAx',
  'contact_form_ArpxEr',
  'ai_gen_block_66d8696_yVRepa',
  'lurvox_sales_closer',
  'lurvox_hide_1month_cl',
]

const present = new Set(section.block_order)
section.block_order = desired.filter((id) => present.has(id) || section.blocks[id])
// Keep any unexpected extras (except removed) at the end
for (const id of present) {
  if (!section.block_order.includes(id) && id !== REMOVE) section.block_order.push(id)
}

if (section.blocks[KEEP_TRANSFORM]) delete section.blocks[KEEP_TRANSFORM].disabled

await put('templates/index.json', `${JSON.stringify(index, null, 2)}\n`)

console.log('home order:')
for (const id of section.block_order) {
  const b = section.blocks[id]
  const title = b?.settings?.title || b?.settings?.heading || b?.type || id
  console.log(' -', id, String(title).slice(0, 60))
}
console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=no-reviews-carousel`)
