/**
 * Live MAIN: add aesthetic "What you get" block on homepage.
 * Theme: Copy of Copy of Offer live 2026-08-05 19:59 (161434501371)
 *
 * Inserts after conversion boost / before NOT A PDF + plan pricing.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const THEME_ID = Number(process.argv[2] || 161434501371)
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function api(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${urlPath}: ${res.status} ${text.slice(0, 600)}`)
  return json
}

async function putAsset(key, value) {
  await api('PUT', `/themes/${THEME_ID}/assets.json`, { asset: { key, value } })
  console.log('uploaded', key)
}

async function getAsset(key) {
  const data = await api('GET', `/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`)
  return data.asset?.value ?? ''
}

const BLOCK_ID = 'lurvox_what_you_get'
const AFTER_ID = 'lurvox_conversion_boost'

const snippet = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-what-you-get.liquid'),
  'utf8'
)

const themes = await api('GET', '/themes.json')
const theme = (themes.themes || []).find((t) => t.id === THEME_ID)
if (!theme) throw new Error(`Theme ${THEME_ID} not found`)
console.log('target', { id: theme.id, name: theme.name, role: theme.role })

await putAsset('snippets/lurvox-what-you-get.liquid', snippet)

const indexRaw = await getAsset('templates/index.json')
const index = JSON.parse(indexRaw)
const section = index.sections?.home_blocks_v2
if (!section?.blocks) throw new Error('home_blocks_v2 missing')

section.blocks[BLOCK_ID] = {
  type: 'custom-liquid',
  settings: {
    custom_liquid: "{% render 'lurvox-what-you-get' %}",
  },
  blocks: {},
}

const order = Array.isArray(section.block_order) ? [...section.block_order] : Object.keys(section.blocks)
const without = order.filter((id) => id !== BLOCK_ID)
const afterIdx = without.indexOf(AFTER_ID)
if (afterIdx === -1) {
  without.splice(1, 0, BLOCK_ID)
} else {
  without.splice(afterIdx + 1, 0, BLOCK_ID)
}
section.block_order = without

await putAsset('templates/index.json', `${JSON.stringify(index, null, 2)}\n`)

console.log('block_order slice', section.block_order.slice(0, 8))
console.log('done — https://www.lurvox.in/#what-you-get')
